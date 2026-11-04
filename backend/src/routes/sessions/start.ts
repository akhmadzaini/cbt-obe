import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { examSessions, exams } from "../../db/schema";
import { deviceFingerprint, getClientIp } from "../../lib/auth";
import { authPlugin } from "../../lib/auth-plugin";
import { isAssignedToExam } from "../../lib/exam-participants";
import { RATE_LIMITS } from "../../lib/rate-limit";
import { buildSessionPayload } from "../../lib/session-service";

export const sessionStartRoutes = new Elysia({ prefix: "/api/sessions" })
  .use(authPlugin)
  .post(
    "/start",
    async ({ body, user, request, server, status }) => {
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
      const ip = getClientIp(request, server);
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
    {
      auth: {
        roles: ["student"],
        rateLimit: { name: "session-start", ...RATE_LIMITS.sessionStart },
      },
      body: t.Object({ examId: t.String() }),
    },
  )
  .get(
    "/:id",
    async ({ params, user, status }) => {
      const payload = await buildSessionPayload(params.id, user.sub);
      if (!payload) return status(404, { error: "Sesi tidak ditemukan." });
      return payload;
    },
    { auth: true },
  )
  .get(
    "/:id/result",
    async ({ params, user, status }) => {
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
    { auth: true },
  );
