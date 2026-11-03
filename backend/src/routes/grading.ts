import { Elysia, t } from "elysia";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  exams,
  questions,
  users,
} from "../db/schema";
import { authenticate, jwtPlugin, requireRole } from "../lib/auth";

type GradeFailure = {
  ok: false;
  code: 400 | 404 | 409;
  error: string;
};

type GradeSuccess = {
  ok: true;
  score: number;
  gradingStatus: "partial" | "completed";
};

/**
 * Penilaian manual untuk soal essay. Soal non-essay sudah dinilai otomatis
 * saat sesi difinalisasi.
 */
export const gradingRoutes = new Elysia({ prefix: "/api/grading" })
  .use(jwtPlugin)
  .get("/pending", async ({ headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!requireRole(user, ["admin", "teacher"])) {
      return status(403, { error: "Akses ditolak." });
    }

    const sessionRows = await db
      .select({
        sessionId: examSessions.id,
        examId: examSessions.examId,
        examTitle: exams.title,
        studentName: users.fullName,
        username: users.username,
        finishedAt: examSessions.finishedAt,
        score: examSessions.score,
        gradingStatus: examSessions.gradingStatus,
      })
      .from(examSessions)
      .innerJoin(exams, eq(exams.id, examSessions.examId))
      .innerJoin(users, eq(users.id, examSessions.userId))
      .where(
        and(
          eq(examSessions.status, "finished"),
          eq(examSessions.gradingStatus, "partial"),
        ),
      )
      .orderBy(desc(examSessions.finishedAt));

    if (sessionRows.length === 0) {
      return { sessions: [] };
    }

    const examIds = [...new Set(sessionRows.map((row) => row.examId))];
    const sessionIds = sessionRows.map((row) => row.sessionId);

    const essayRows = await db
      .select({
        examId: examQuestions.examId,
        questionId: questions.id,
        questionText: questions.questionText,
        questionPoints: questions.points,
        pointsOverride: examQuestions.pointsOverride,
      })
      .from(examQuestions)
      .innerJoin(questions, eq(questions.id, examQuestions.questionId))
      .where(
        and(
          inArray(examQuestions.examId, examIds),
          eq(questions.questionType, "essay"),
        ),
      );

    const answerRows = await db
      .select()
      .from(examAnswers)
      .where(inArray(examAnswers.sessionId, sessionIds));
    const answerMap = new Map(
      answerRows.map((answer) => [
        `${answer.sessionId}:${answer.questionId}`,
        answer,
      ]),
    );

    return {
      sessions: sessionRows.map((session) => ({
        ...session,
        essays: essayRows
          .filter((essay) => essay.examId === session.examId)
          .map((essay) => {
            const answer = answerMap.get(
              `${session.sessionId}:${essay.questionId}`,
            );
            const payload = answer?.answerPayload as
              | { text?: unknown }
              | null
              | undefined;
            return {
              answerId: answer?.id ?? null,
              questionId: essay.questionId,
              questionText: essay.questionText,
              answerText:
                typeof payload?.text === "string" ? payload.text : "",
              points: String(
                essay.pointsOverride ?? essay.questionPoints,
              ),
              scoreAwarded: answer?.scoreAwarded ?? null,
            };
          }),
      })),
    };
  })
  .post(
    "/sessions/:id",
    async ({ params, body, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const result = await db.transaction(
        async (tx): Promise<GradeFailure | GradeSuccess> => {
          const [session] = await tx
            .select()
            .from(examSessions)
            .where(eq(examSessions.id, params.id))
            .for("update");

          if (!session) {
            return {
              ok: false,
              code: 404,
              error: "Sesi tidak ditemukan.",
            };
          }
          if (session.status !== "finished") {
            return {
              ok: false,
              code: 409,
              error: "Sesi belum selesai.",
            };
          }

          const essayRows = await tx
            .select({
              questionId: questions.id,
              questionPoints: questions.points,
              pointsOverride: examQuestions.pointsOverride,
            })
            .from(examQuestions)
            .innerJoin(questions, eq(questions.id, examQuestions.questionId))
            .where(
              and(
                eq(examQuestions.examId, session.examId),
                eq(questions.questionType, "essay"),
              ),
            );

          const maxPoints = new Map(
            essayRows.map((row) => [
              row.questionId,
              Number(row.pointsOverride ?? row.questionPoints),
            ]),
          );

          const answers = await tx
            .select()
            .from(examAnswers)
            .where(eq(examAnswers.sessionId, session.id));
          const answerById = new Map(
            answers.map((answer) => [answer.id, answer]),
          );

          // Validasi seluruh nilai sebelum menulis apa pun.
          const updates: { answerId: string; score: number }[] = [];
          for (const grade of body.grades) {
            const answer = answerById.get(grade.answerId);
            if (!answer) {
              return {
                ok: false,
                code: 404,
                error: "Jawaban tidak ditemukan pada sesi ini.",
              };
            }

            const limit = maxPoints.get(answer.questionId);
            if (limit === undefined) {
              return {
                ok: false,
                code: 400,
                error: "Jawaban bukan soal essay.",
              };
            }

            const score = Number(grade.score);
            if (!Number.isFinite(score) || score < 0 || score > limit) {
              return {
                ok: false,
                code: 400,
                error: `Nilai harus antara 0 dan ${limit}.`,
              };
            }
            updates.push({ answerId: answer.id, score });
          }

          for (const update of updates) {
            await tx
              .update(examAnswers)
              .set({
                scoreAwarded: update.score.toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(examAnswers.id, update.answerId));
          }

          const refreshed = await tx
            .select()
            .from(examAnswers)
            .where(eq(examAnswers.sessionId, session.id));
          const essayQuestionIds = new Set(
            essayRows.map((row) => row.questionId),
          );
          const hasUngraded = refreshed.some(
            (answer) =>
              essayQuestionIds.has(answer.questionId) &&
              answer.scoreAwarded === null,
          );
          const total = refreshed.reduce(
            (sum, answer) => sum + Number(answer.scoreAwarded ?? 0),
            0,
          );
          const gradingStatus = hasUngraded ? "partial" : "completed";

          await tx
            .update(examSessions)
            .set({
              score: total.toFixed(2),
              gradingStatus,
              updatedAt: new Date(),
            })
            .where(eq(examSessions.id, session.id));

          return {
            ok: true,
            score: Math.round(total * 100) / 100,
            gradingStatus,
          };
        },
      );

      if (!result.ok) {
        return status(result.code, { error: result.error });
      }
      return result;
    },
    {
      body: t.Object({
        grades: t.Array(
          t.Object({
            answerId: t.String(),
            score: t.Number(),
          }),
        ),
      }),
    },
  );
