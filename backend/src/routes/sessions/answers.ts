import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  questionOptions,
} from "../../db/schema";
import { authPlugin } from "../../lib/auth-plugin";
import { RATE_LIMITS } from "../../lib/rate-limit";
import { finalizeSession } from "../../lib/session-service";

export const sessionAnswerRoutes = new Elysia({ prefix: "/api/sessions" })
  .use(authPlugin)
  .put(
    "/:id/answers/:questionId",
    async ({ params, body, user, status }) => {
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
      auth: {
        rateLimit: { name: "answer-save", ...RATE_LIMITS.answerSave },
      },
      body: t.Object({
        selectedOptionId: t.Optional(t.Union([t.String(), t.Null()])),
        answerPayload: t.Optional(t.Any()),
        isFlagged: t.Optional(t.Boolean()),
      }),
    },
  );
