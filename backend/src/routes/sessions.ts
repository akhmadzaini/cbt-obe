import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  exams,
  questionOptions,
  examViolationLogs,
} from "../db/schema";
import {
  authenticate,
  deviceFingerprint,
  getClientIp,
  jwtPlugin,
} from "../lib/auth";
import { saveUploadedFile } from "../lib/files";
import { isAssignedToExam } from "../lib/exam-participants";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  RATE_LIMITS,
  rateLimitMessage,
} from "../lib/rate-limit";
import {
  buildSessionPayload,
  finalizeSession,
  remainingSeconds,
} from "../lib/session-service";

const VIOLATION_TYPES = new Set([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "dom_injection",
  "contextmenu",
  "copy_paste",
  "keyboard_shortcut",
]);

/**
 * Hanya pelanggaran berat yang menambah strike & menjeda timer.
 * Pemblokiran interaksi (klik kanan, copy/paste, shortcut) tetap dicatat
 * sebagai log tetapi tidak dihitung sebagai strike.
 */
const STRIKE_TYPES = new Set([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "dom_injection",
]);

type ViolationType =
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "dom_injection"
  | "contextmenu"
  | "copy_paste"
  | "keyboard_shortcut";

export const sessionRoutes = new Elysia({ prefix: "/api/sessions" })
  .use(jwtPlugin)
  .post(
    "/start",
    async ({ body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });
      if (user.role !== "student") {
        return status(403, { error: "Hanya peserta yang dapat memulai ujian." });
      }

      const limit = checkRateLimit(
        `session-start:${user.sub}`,
        RATE_LIMITS.sessionStart.limit,
        RATE_LIMITS.sessionStart.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [exam] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, body.examId))
        .limit(1);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });
      if (exam.status !== "published") {
        return status(409, { error: "Ujian belum dipublikasikan." });
      }

      const now = new Date();
      if (exam.startAt && now < new Date(exam.startAt)) {
        return status(409, { error: "Ujian belum dimulai." });
      }
      if (exam.endAt && now > new Date(exam.endAt)) {
        return status(409, { error: "Ujian sudah berakhir." });
      }

      const [existing] = await db
        .select()
        .from(examSessions)
        .where(
          and(
            eq(examSessions.examId, exam.id),
            eq(examSessions.userId, user.sub),
          ),
        )
        .limit(1);

      if (existing) {
        if (existing.status === "finished") {
          return status(409, { error: "Anda sudah menyelesaikan ujian ini." });
        }
        if (existing.status === "suspended") {
          return status(409, {
            error: "Sesi ditangguhkan. Hubungi pengawas.",
          });
        }
        return await buildSessionPayload(existing.id, user.sub);
      }

      const assigned = await isAssignedToExam(exam.id, user.sub);
      if (!assigned) {
        return status(403, {
          error: "Anda tidak terdaftar sebagai peserta ujian ini.",
        });
      }

      const sessionId = randomUUID();
      const ip = getClientIp(request, server as never);
      const userAgent = request.headers.get("user-agent") ?? "";
      const deadlineAt = new Date(
        now.getTime() + exam.durationMinutes * 60_000,
      );

      try {
        await db.insert(examSessions).values({
          id: sessionId,
          examId: exam.id,
          userId: user.sub,
          status: "in_progress",
          startedAt: now,
          deadlineAt,
          lastHeartbeatAt: now,
          ipAddress: ip,
          userAgent,
          deviceFingerprint: deviceFingerprint(userAgent, ip),
        });
      } catch {
        // Race condition: sesi sudah dibuat request lain.
        const [created] = await db
          .select()
          .from(examSessions)
          .where(
            and(
              eq(examSessions.examId, exam.id),
              eq(examSessions.userId, user.sub),
            ),
          )
          .limit(1);
        if (!created) {
          return status(500, { error: "Gagal memulai sesi ujian." });
        }
        return await buildSessionPayload(created.id, user.sub);
      }

      return await buildSessionPayload(sessionId, user.sub);
    },
    { body: t.Object({ examId: t.String() }) },
  )
  .get("/:id", async ({ params, headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!user) return status(401, { error: "Unauthorized" });

    const payload = await buildSessionPayload(params.id, user.sub);
    if (!payload) return status(404, { error: "Sesi tidak ditemukan." });
    return payload;
  })
  .put(
    "/:id/answers/:questionId",
    async ({ params, body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const limit = checkRateLimit(
        `answer-save:${user.sub}`,
        RATE_LIMITS.answerSave.limit,
        RATE_LIMITS.answerSave.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.id))
          .for("update");

        if (!session) {
          return { ok: false as const, code: 404, error: "Sesi tidak ditemukan." };
        }
        if (session.userId !== user.sub) {
          return { ok: false as const, code: 403, error: "Sesi bukan milik Anda." };
        }
        if (session.status !== "in_progress") {
          return { ok: false as const, code: 409, error: "Sesi tidak aktif." };
        }
        if (session.pausedAt) {
          return { ok: false as const, code: 409, error: "Ujian sedang terkunci." };
        }
        if (Date.now() > new Date(session.deadlineAt).getTime()) {
          await finalizeSession(tx, session.id, "time_expired");
          return {
            ok: false as const,
            code: 409,
            error: "Waktu ujian habis. Jawaban tidak dapat disimpan.",
          };
        }

        const [examQuestion] = await tx
          .select()
          .from(examQuestions)
          .where(
            and(
              eq(examQuestions.examId, session.examId),
              eq(examQuestions.questionId, params.questionId),
            ),
          )
          .limit(1);

        if (!examQuestion) {
          return {
            ok: false as const,
            code: 400,
            error: "Soal bukan bagian dari ujian ini.",
          };
        }

        if (body.selectedOptionId) {
          const [option] = await tx
            .select({ id: questionOptions.id })
            .from(questionOptions)
            .where(
              and(
                eq(questionOptions.id, body.selectedOptionId),
                eq(questionOptions.questionId, params.questionId),
              ),
            )
            .limit(1);
          if (!option) {
            return {
              ok: false as const,
              code: 400,
              error: "Opsi jawaban tidak valid untuk soal ini.",
            };
          }
        }

        const now = new Date();
        const insertValues: Record<string, unknown> = {
          id: randomUUID(),
          sessionId: session.id,
          questionId: params.questionId,
          selectedOptionId: body.selectedOptionId ?? null,
          answerPayload: body.answerPayload ?? null,
          isFlagged: body.isFlagged ?? false,
          answeredAt: now,
          updatedAt: now,
        };

        const updateSet: Record<string, unknown> = { updatedAt: now };
        if (body.selectedOptionId !== undefined) {
          updateSet.selectedOptionId = body.selectedOptionId;
        }
        if (body.answerPayload !== undefined) {
          updateSet.answerPayload = body.answerPayload;
        }
        if (body.isFlagged !== undefined) {
          updateSet.isFlagged = body.isFlagged;
        }

        await tx
          .insert(examAnswers)
          .values(insertValues as never)
          .onDuplicateKeyUpdate({ set: updateSet as never });

        const [saved] = await tx
          .select()
          .from(examAnswers)
          .where(
            and(
              eq(examAnswers.sessionId, session.id),
              eq(examAnswers.questionId, params.questionId),
            ),
          )
          .limit(1);

        return { ok: true as const, answer: saved };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return { answer: result.answer };
    },
    {
      body: t.Object({
        selectedOptionId: t.Optional(t.Union([t.String(), t.Null()])),
        answerPayload: t.Optional(t.Any()),
        isFlagged: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/:id/violations",
    async ({ params, body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const limit = checkRateLimit(
        `violation:${user.sub}`,
        RATE_LIMITS.violation.limit,
        RATE_LIMITS.violation.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const violationType = String(body.violationType);
      if (!VIOLATION_TYPES.has(violationType)) {
        return status(400, { error: "violationType tidak dikenal." });
      }

      let metadata: Record<string, unknown> | null = null;
      if (body.metadata !== undefined && body.metadata !== null) {
        if (typeof body.metadata === "string") {
          try {
            metadata = JSON.parse(body.metadata) as Record<string, unknown>;
          } catch {
            return status(400, { error: "metadata bukan JSON valid." });
          }
        } else if (typeof body.metadata === "object") {
          // Multipart parser dapat otomatis mem-parse field JSON menjadi objek.
          metadata = body.metadata as Record<string, unknown>;
        } else {
          return status(400, { error: "metadata tidak valid." });
        }
      }

      let screenshotUrl: string | null = null;
      if (body.screenshot instanceof File) {
        screenshotUrl = await saveUploadedFile(
          body.screenshot,
          `violations/${params.id}`,
        );
      }

      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.id))
          .for("update");

        if (!session) {
          return { ok: false as const, code: 404, error: "Sesi tidak ditemukan." };
        }
        if (session.userId !== user.sub) {
          return { ok: false as const, code: 403, error: "Sesi bukan milik Anda." };
        }

        if (session.status === "finished") {
          return {
            ok: true as const,
            forceSubmit: true,
            strikeCount: session.strikeCount,
            maxStrikes: 0,
            sessionStatus: session.status,
          };
        }

        const [exam] = await tx
          .select()
          .from(exams)
          .where(eq(exams.id, session.examId))
          .limit(1);
        if (!exam) {
          return { ok: false as const, code: 404, error: "Ujian tidak ditemukan." };
        }

        const isStrike = STRIKE_TYPES.has(violationType);
        const strikeCount = isStrike
          ? session.strikeCount + 1
          : session.strikeCount;
        const now = new Date();

        await tx.insert(examViolationLogs).values({
          id: randomUUID(),
          sessionId: session.id,
          violationType: violationType as ViolationType,
          strikeNumber: strikeCount,
          screenshotUrl,
          metadata,
          timestamp: now,
        });

        if (isStrike) {
          await tx
            .update(examSessions)
            .set({
              strikeCount,
              pausedAt: session.pausedAt ?? now,
              updatedAt: now,
            })
            .where(eq(examSessions.id, session.id));
        } else {
          await tx
            .update(examSessions)
            .set({ updatedAt: now })
            .where(eq(examSessions.id, session.id));
        }

        if (isStrike && strikeCount > exam.maxStrikes) {
          const finalized = await finalizeSession(
            tx,
            session.id,
            "force_submit",
          );
          return {
            ok: true as const,
            forceSubmit: true,
            isStrike,
            strikeCount,
            maxStrikes: exam.maxStrikes,
            sessionStatus: "finished",
            score: finalized.score,
          };
        }

        return {
          ok: true as const,
          forceSubmit: false,
          isStrike,
          strikeCount,
          maxStrikes: exam.maxStrikes,
          sessionStatus: session.status,
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return result;
    },
    {
      body: t.Object({
        violationType: t.String(),
        metadata: t.Optional(t.Any()),
        screenshot: t.Optional(t.File()),
      }),
    },
  )
  .post(
    "/:id/pause",
    async ({ params, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.id))
          .for("update");

        if (!session) {
          return { ok: false as const, code: 404, error: "Sesi tidak ditemukan." };
        }
        if (session.userId !== user.sub) {
          return { ok: false as const, code: 403, error: "Sesi bukan milik Anda." };
        }
        if (session.status !== "in_progress") {
          return { ok: false as const, code: 409, error: "Sesi tidak aktif." };
        }

        const now = new Date();
        if (!session.pausedAt) {
          await tx
            .update(examSessions)
            .set({ pausedAt: now, updatedAt: now })
            .where(eq(examSessions.id, session.id));
        }

        return { ok: true as const, pausedAt: session.pausedAt ?? now };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return { pausedAt: result.pausedAt };
    },
  )
  .post(
    "/:id/resume",
    async ({ params, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.id))
          .for("update");

        if (!session) {
          return { ok: false as const, code: 404, error: "Sesi tidak ditemukan." };
        }
        if (session.userId !== user.sub) {
          return { ok: false as const, code: 403, error: "Sesi bukan milik Anda." };
        }
        if (session.status !== "in_progress") {
          return { ok: false as const, code: 409, error: "Sesi tidak aktif." };
        }

        const now = new Date();
        let deadlineAt = new Date(session.deadlineAt);
        let accumulated = session.accumulatedPauseSeconds;

        if (session.pausedAt) {
          const pausedMs = now.getTime() - new Date(session.pausedAt).getTime();
          deadlineAt = new Date(deadlineAt.getTime() + Math.max(0, pausedMs));
          accumulated += Math.max(0, Math.floor(pausedMs / 1000));
          await tx
            .update(examSessions)
            .set({
              deadlineAt,
              pausedAt: null,
              accumulatedPauseSeconds: accumulated,
              updatedAt: now,
            })
            .where(eq(examSessions.id, session.id));
        }

        return {
          ok: true as const,
          deadlineAt,
          remainingSeconds: remainingSeconds(deadlineAt),
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return {
        deadlineAt: result.deadlineAt,
        remainingSeconds: result.remainingSeconds,
      };
    },
  )
  .post(
    "/:id/heartbeat",
    async ({ params, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const limit = checkRateLimit(
        `heartbeat:${user.sub}`,
        RATE_LIMITS.heartbeat.limit,
        RATE_LIMITS.heartbeat.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [session] = await db
        .select()
        .from(examSessions)
        .where(
          and(
            eq(examSessions.id, params.id),
            eq(examSessions.userId, user.sub),
          ),
        )
        .limit(1);

      if (!session) return status(404, { error: "Sesi tidak ditemukan." });

      const now = new Date();
      await db
        .update(examSessions)
        .set({ lastHeartbeatAt: now, updatedAt: now })
        .where(eq(examSessions.id, session.id));

      return {
        serverTime: now.toISOString(),
        remainingSeconds: remainingSeconds(session.deadlineAt),
        paused: Boolean(session.pausedAt),
        status: session.status,
        strikeCount: session.strikeCount,
      };
    },
  )
  .post(
    "/:id/submit",
    async ({ params, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const limit = checkRateLimit(
        `submit:${user.sub}`,
        RATE_LIMITS.submit.limit,
        RATE_LIMITS.submit.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.id))
          .for("update");

        if (!session) {
          return { ok: false as const, code: 404, error: "Sesi tidak ditemukan." };
        }
        if (session.userId !== user.sub) {
          return { ok: false as const, code: 403, error: "Sesi bukan milik Anda." };
        }

        if (session.status === "finished") {
          return {
            ok: true as const,
            alreadyFinished: true,
            score: Number(session.score ?? 0),
            gradingStatus: session.gradingStatus,
            finishedReason: session.finishedReason,
          };
        }

        const finalized = await finalizeSession(tx, session.id, "submitted");
        return {
          ok: true as const,
          alreadyFinished: false,
          score: finalized.score,
          gradingStatus: finalized.gradingStatus,
          finishedReason: "submitted",
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return result;
    },
  )
  .get(
    "/:id/result",
    async ({ params, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!user) return status(401, { error: "Unauthorized" });

      const payload = await buildSessionPayload(params.id, user.sub);
      if (!payload) return status(404, { error: "Sesi tidak ditemukan." });
      if (payload.session.status !== "finished") {
        return status(409, { error: "Ujian belum selesai." });
      }

      return {
        ...payload,
        result: {
          score: payload.session.score,
          gradingStatus: payload.session.gradingStatus,
          finishedReason: payload.session.finishedReason,
          finishedAt: payload.session.finishedAt,
        },
      };
    },
  );
