import { Elysia, t } from "elysia";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  like,
  max,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  examViolationLogs,
  exams,
  questionMatchPairs,
  questionOptions,
  questions,
  subjects,
  users,
} from "../db/schema";
import { getClientIp } from "../lib/auth";
import { authPlugin } from "../lib/auth-plugin";
import { logSystemEvent } from "../lib/audit";
import { removeSessionUploads } from "../lib/files";
import { RATE_LIMITS } from "../lib/rate-limit";
import { remainingSeconds } from "../lib/session-service";
import { getSessionUsage } from "../lib/session-usage";
import { buildResultsExport } from "../lib/results-export";

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 1000);
}

function parseOffset(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export const resultRoutes = new Elysia({ prefix: "/api/results" })
  .use(authPlugin)
  .get(
    "/",
    async ({ query }) => {
      const examId = (query.examId ?? "").trim();
      const search = (query.search ?? "").trim();
      const statusFilter = query.status ?? "all";

      const conditions: SQL[] = [];
      if (examId) conditions.push(eq(examSessions.examId, examId));
      if (statusFilter === "finished") {
        conditions.push(eq(examSessions.status, "finished"));
      } else if (statusFilter === "in_progress") {
        conditions.push(
          inArray(examSessions.status, ["started", "in_progress"]),
        );
      } else if (statusFilter === "suspended") {
        conditions.push(eq(examSessions.status, "suspended"));
      }
      if (search) {
        const searchCondition = or(
          like(users.fullName, `%${search}%`),
          like(users.username, `%${search}%`),
        );
        if (searchCondition) conditions.push(searchCondition);
      }

      const limit = parseLimit(query.limit, 300);
      const offset = parseOffset(query.offset);

      const rows = await db
        .select({
          sessionId: examSessions.id,
          examId: examSessions.examId,
          examTitle: exams.title,
          subjectName: subjects.name,
          studentId: users.id,
          studentName: users.fullName,
          username: users.username,
          status: examSessions.status,
          score: examSessions.score,
          gradingStatus: examSessions.gradingStatus,
          finishedReason: examSessions.finishedReason,
          startedAt: examSessions.startedAt,
          finishedAt: examSessions.finishedAt,
          strikeCount: examSessions.strikeCount,
        })
        .from(examSessions)
        .innerJoin(users, eq(users.id, examSessions.userId))
        .innerJoin(exams, eq(exams.id, examSessions.examId))
        .leftJoin(subjects, eq(subjects.id, exams.subjectId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(examSessions.startedAt))
        .limit(limit)
        .offset(offset);

      const examIds = [...new Set(rows.map((row) => row.examId))];
      const sessionIds = rows.map((row) => row.sessionId);

      const pointRows =
        examIds.length > 0
          ? await db
              .select({
                examId: examQuestions.examId,
                pointsOverride: examQuestions.pointsOverride,
                points: questions.points,
              })
              .from(examQuestions)
              .innerJoin(questions, eq(questions.id, examQuestions.questionId))
              .where(inArray(examQuestions.examId, examIds))
          : [];

      const maxScoreMap = new Map<string, number>();
      for (const row of pointRows) {
        const points = Number(row.pointsOverride ?? row.points);
        maxScoreMap.set(
          row.examId,
          (maxScoreMap.get(row.examId) ?? 0) + points,
        );
      }

      const violationRows =
        sessionIds.length > 0
          ? await db
              .select({
                sessionId: examViolationLogs.sessionId,
                total: count(examViolationLogs.id),
                lastAt: max(examViolationLogs.timestamp),
              })
              .from(examViolationLogs)
              .where(inArray(examViolationLogs.sessionId, sessionIds))
              .groupBy(examViolationLogs.sessionId)
          : [];

      const violationMap = new Map(
        violationRows.map((row) => [
          row.sessionId,
          {
            total: Number(row.total),
            lastAt: row.lastAt,
          },
        ]),
      );

      return {
        results: rows.map((row) => ({
          ...row,
          maxScore: Math.round((maxScoreMap.get(row.examId) ?? 0) * 100) / 100,
          violationCount: violationMap.get(row.sessionId)?.total ?? 0,
          lastViolationAt: violationMap.get(row.sessionId)?.lastAt ?? null,
        })),
        total: rows.length,
        limit,
        offset,
      };
    },
    {
      auth: { roles: ["admin", "teacher"] },
      query: t.Object({
        examId: t.Optional(t.String()),
        search: t.Optional(t.String()),
        status: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:sessionId/reset",
    async ({ params, user, request, server, status }) => {
      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.sessionId))
          .for("update");

        if (!session) {
          return {
            ok: false as const,
            code: 404,
            error: "Sesi tidak ditemukan.",
          };
        }
        if (session.status !== "finished") {
          return {
            ok: false as const,
            code: 409,
            error: "Hanya sesi yang sudah selesai yang dapat direset.",
          };
        }
        if (session.finishedReason !== "force_submit") {
          return {
            ok: false as const,
            code: 409,
            error:
              "Reset hanya berlaku untuk sesi yang dihentikan paksa karena pelanggaran.",
          };
        }

        const [exam] = await tx
          .select({
            id: exams.id,
            title: exams.title,
            status: exams.status,
          })
          .from(exams)
          .where(eq(exams.id, session.examId))
          .limit(1);
        if (!exam) {
          return {
            ok: false as const,
            code: 404,
            error: "Ujian tidak ditemukan.",
          };
        }
        if (exam.status === "archived") {
          return {
            ok: false as const,
            code: 409,
            error:
              "Ujian sudah diarsipkan. Buka kembali status ujian sebelum mereset sesi.",
          };
        }

        const now = new Date();
        const finishedAt = session.finishedAt
          ? new Date(session.finishedAt)
          : now;
        // Kembalikan waktu yang hilang selama sesi terhenti paksa. Timer tetap
        // dijeda (pausedAt) sampai peserta kembali masuk mode layar penuh.
        const downtimeMs = Math.max(0, now.getTime() - finishedAt.getTime());
        const deadlineAt = new Date(
          new Date(session.deadlineAt).getTime() + downtimeMs,
        );

        await tx
          .update(examSessions)
          .set({
            status: "in_progress",
            finishedAt: null,
            finishedReason: null,
            score: null,
            gradingStatus: "pending",
            strikeCount: 0,
            pausedAt: now,
            deadlineAt,
            updatedAt: now,
          })
          .where(eq(examSessions.id, session.id));

        // Skor sementara dari finalisasi sebelumnya dibuang agar dihitung ulang
        // saat peserta mengumpulkan jawaban lagi.
        await tx
          .update(examAnswers)
          .set({ scoreAwarded: null, updatedAt: now })
          .where(eq(examAnswers.sessionId, session.id));

        return {
          ok: true as const,
          sessionId: session.id,
          examId: session.examId,
          examTitle: exam.title,
          studentId: session.userId,
          restoredStrikeCount: session.strikeCount,
          deadlineAt,
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });

      const [actor] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, user.sub))
        .limit(1);

      await logSystemEvent({
        actorId: user.sub,
        actorUsername: actor?.username ?? "admin",
        action: "session.reset",
        detail: {
          sessionId: result.sessionId,
          examId: result.examId,
          examTitle: result.examTitle,
          studentId: result.studentId,
          restoredStrikeCount: result.restoredStrikeCount,
          reason: "force_submit",
        },
        ip: getClientIp(request, server),
      });

      return {
        ok: true,
        sessionId: result.sessionId,
        status: "in_progress",
        deadlineAt: result.deadlineAt,
        remainingSeconds: remainingSeconds(result.deadlineAt),
      };
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "session-reset", ...RATE_LIMITS.crud },
      },
    },
  )
  .delete(
    "/:sessionId",
    async ({ params, user, request, server, status }) => {
      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(examSessions)
          .where(eq(examSessions.id, params.sessionId))
          .for("update");

        if (!session) {
          return {
            ok: false as const,
            code: 404,
            error: "Sesi tidak ditemukan.",
          };
        }
        if (session.status !== "finished") {
          return {
            ok: false as const,
            code: 409,
            error:
              "Hanya sesi yang sudah selesai yang submission-nya dapat dibatalkan.",
          };
        }

        const [exam] = await tx
          .select({
            id: exams.id,
            title: exams.title,
            status: exams.status,
          })
          .from(exams)
          .where(eq(exams.id, session.examId))
          .limit(1);
        if (!exam) {
          return {
            ok: false as const,
            code: 404,
            error: "Ujian tidak ditemukan.",
          };
        }
        if (exam.status === "archived") {
          return {
            ok: false as const,
            code: 409,
            error:
              "Ujian sudah diarsipkan. Buka kembali status ujian sebelum membatalkan submission.",
          };
        }

        const [answerTotal] = await tx
          .select({ total: count() })
          .from(examAnswers)
          .where(eq(examAnswers.sessionId, session.id));
        const [violationTotal] = await tx
          .select({ total: count() })
          .from(examViolationLogs)
          .where(eq(examViolationLogs.sessionId, session.id));
        const [screenshotTotal] = await tx
          .select({ total: count() })
          .from(examViolationLogs)
          .where(
            and(
              eq(examViolationLogs.sessionId, session.id),
              isNotNull(examViolationLogs.screenshotUrl),
            ),
          );

        // Hapus eksplisit agar jumlah yang dilaporkan ke audit akurat dan tidak
        // bergantung pada cascade database.
        await tx
          .delete(examAnswers)
          .where(eq(examAnswers.sessionId, session.id));
        await tx
          .delete(examViolationLogs)
          .where(eq(examViolationLogs.sessionId, session.id));
        await tx.delete(examSessions).where(eq(examSessions.id, session.id));

        return {
          ok: true as const,
          sessionId: session.id,
          examId: session.examId,
          examTitle: exam.title,
          studentId: session.userId,
          finishedReason: session.finishedReason,
          score: session.score,
          answerCount: Number(answerTotal?.total ?? 0),
          violationCount: Number(violationTotal?.total ?? 0),
          screenshotCount: Number(screenshotTotal?.total ?? 0),
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });

      // Screenshot pelanggaran disimpan di folder per sesi; bersihkan setelah
      // transaksi sukses tanpa menggagalkan operasi utama.
      await removeSessionUploads(result.sessionId);

      const [actor] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, user.sub))
        .limit(1);

      await logSystemEvent({
        actorId: user.sub,
        actorUsername: actor?.username ?? "admin",
        action: "session.cancel",
        detail: {
          sessionId: result.sessionId,
          examId: result.examId,
          examTitle: result.examTitle,
          studentId: result.studentId,
          finishedReason: result.finishedReason,
          score: result.score,
          answerCount: result.answerCount,
          violationCount: result.violationCount,
          screenshotCount: result.screenshotCount,
        },
        ip: getClientIp(request, server),
      });

      return {
        ok: true,
        sessionId: result.sessionId,
        deletedAnswers: result.answerCount,
        deletedViolations: result.violationCount,
        deletedScreenshots: result.screenshotCount,
      };
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "session-cancel", ...RATE_LIMITS.crud },
      },
    },
  )
  .get(
    "/export",
    async ({ query, status }) => {
      const examId = (query.examId ?? "").trim();
      if (!examId) {
        return status(400, { error: "examId wajib diisi." });
      }

      const mode = query.mode ?? "summary";
      if (mode !== "summary" && mode !== "category") {
        return status(400, {
          error: "mode harus bernilai summary atau category.",
        });
      }

      const result = await buildResultsExport(examId, mode);
      if (!result) {
        return status(404, { error: "Ujian tidak ditemukan." });
      }

      return new Response(result.buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Content-Length": String(result.buffer.length),
          "Cache-Control": "no-store",
        },
      });
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "results-export", ...RATE_LIMITS.resultsExport },
      },
      query: t.Object({
        examId: t.Optional(t.String()),
        mode: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/:sessionId/usage",
    async ({ params, status }) => {
      const usage = await getSessionUsage(params.sessionId);
      if (!usage) {
        return status(404, { error: "Sesi tidak ditemukan." });
      }
      return { usage };
    },
    { auth: { roles: ["admin"] } },
  )
  .get(
    "/:sessionId",
    async ({ params, status }) => {
      const [session] = await db
        .select({
          id: examSessions.id,
          examId: examSessions.examId,
          examTitle: exams.title,
          subjectName: subjects.name,
          studentId: users.id,
          studentName: users.fullName,
          username: users.username,
          status: examSessions.status,
          score: examSessions.score,
          gradingStatus: examSessions.gradingStatus,
          finishedReason: examSessions.finishedReason,
          startedAt: examSessions.startedAt,
          finishedAt: examSessions.finishedAt,
          strikeCount: examSessions.strikeCount,
        })
        .from(examSessions)
        .innerJoin(users, eq(users.id, examSessions.userId))
        .innerJoin(exams, eq(exams.id, examSessions.examId))
        .leftJoin(subjects, eq(subjects.id, exams.subjectId))
        .where(eq(examSessions.id, params.sessionId))
        .limit(1);

      if (!session) {
        return status(404, { error: "Sesi tidak ditemukan." });
      }

      const questionRows = await db
        .select({
          id: questions.id,
          orderIndex: examQuestions.orderIndex,
          pointsOverride: examQuestions.pointsOverride,
          points: questions.points,
          questionType: questions.questionType,
          questionText: questions.questionText,
          imageUrl: questions.imageUrl,
        })
        .from(examQuestions)
        .innerJoin(questions, eq(questions.id, examQuestions.questionId))
        .where(eq(examQuestions.examId, session.examId))
        .orderBy(asc(examQuestions.orderIndex));

      const questionIds = questionRows.map((row) => row.id);
      const optionRows =
        questionIds.length > 0
          ? await db
              .select({
                id: questionOptions.id,
                questionId: questionOptions.questionId,
                label: questionOptions.label,
                optionText: questionOptions.optionText,
              })
              .from(questionOptions)
              .where(inArray(questionOptions.questionId, questionIds))
              .orderBy(asc(questionOptions.orderIndex))
          : [];
      const pairRows =
        questionIds.length > 0
          ? await db
              .select({
                id: questionMatchPairs.id,
                questionId: questionMatchPairs.questionId,
                leftText: questionMatchPairs.leftText,
                rightText: questionMatchPairs.rightText,
              })
              .from(questionMatchPairs)
              .where(inArray(questionMatchPairs.questionId, questionIds))
              .orderBy(asc(questionMatchPairs.orderIndex))
          : [];

      const answerRows = await db
        .select()
        .from(examAnswers)
        .where(eq(examAnswers.sessionId, session.id));

      const violationRows = await db
        .select()
        .from(examViolationLogs)
        .where(eq(examViolationLogs.sessionId, session.id))
        .orderBy(desc(examViolationLogs.timestamp));

      const maxScore = questionRows.reduce(
        (sum, row) => sum + Number(row.pointsOverride ?? row.points),
        0,
      );

      return {
        session: {
          ...session,
          maxScore: Math.round(maxScore * 100) / 100,
          violationCount: violationRows.length,
        },
        questions: questionRows.map((row) => ({
          id: row.id,
          orderIndex: row.orderIndex,
          points: String(row.pointsOverride ?? row.points),
          questionType: row.questionType,
          questionText: row.questionText,
          imageUrl: row.imageUrl,
          options: optionRows
            .filter((option) => option.questionId === row.id)
            .map((option) => ({
              id: option.id,
              label: option.label,
              optionText: option.optionText,
            })),
          matchPairs: pairRows
            .filter((pair) => pair.questionId === row.id)
            .map((pair) => ({
              id: pair.id,
              leftText: pair.leftText,
              rightText: pair.rightText,
            })),
        })),
        answers: answerRows.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          answerPayload: answer.answerPayload,
          isFlagged: answer.isFlagged,
          scoreAwarded: answer.scoreAwarded,
          answeredAt: answer.answeredAt,
        })),
        violations: violationRows.map((violation) => ({
          id: violation.id,
          violationType: violation.violationType,
          strikeNumber: violation.strikeNumber,
          timestamp: violation.timestamp,
          screenshotUrl: violation.screenshotUrl,
          metadata: violation.metadata,
        })),
      };
    },
    { auth: { roles: ["admin", "teacher"] } },
  );
