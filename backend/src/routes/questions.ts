import { Elysia, t } from "elysia";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  questionMatchPairs,
  questionOptions,
  questions,
  subjects,
} from "../db/schema";
import { authenticate, jwtPlugin, requireRole } from "../lib/auth";
import { removeQuestionUploads, saveUploadedFile } from "../lib/files";
import { getQuestionUsage } from "../lib/question-usage";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  RATE_LIMITS,
  rateLimitMessage,
} from "../lib/rate-limit";
import {
  createQuestion,
  deleteQuestion,
  QuestionConflictError,
  QuestionInputError,
  QuestionNotFoundError,
  updateQuestion,
  type QuestionInput,
} from "../lib/questions";

async function loadQuestionDetails(questionIds: string[]) {
  if (questionIds.length === 0) return [];

  const questionRows = await db
    .select()
    .from(questions)
    .where(inArray(questions.id, questionIds));
  const optionRows = await db
    .select()
    .from(questionOptions)
    .where(inArray(questionOptions.questionId, questionIds))
    .orderBy(asc(questionOptions.orderIndex));
  const pairRows = await db
    .select()
    .from(questionMatchPairs)
    .where(inArray(questionMatchPairs.questionId, questionIds))
    .orderBy(asc(questionMatchPairs.orderIndex));

  return questionRows.map((question) => ({
    ...question,
    options: optionRows.filter((option) => option.questionId === question.id),
    matchPairs: pairRows.filter((pair) => pair.questionId === question.id),
  }));
}

const optionBody = t.Object({
  id: t.Optional(t.String()),
  optionText: t.Optional(t.Union([t.String(), t.Null()])),
  fraction: t.Optional(t.Number()),
  feedback: t.Optional(t.Union([t.String(), t.Null()])),
});

const pairBody = t.Object({
  id: t.Optional(t.String()),
  leftText: t.Optional(t.Union([t.String(), t.Null()])),
  rightText: t.Optional(t.Union([t.String(), t.Null()])),
});

const questionContentBody = {
  questionType: t.String(),
  questionText: t.String(),
  points: t.Number(),
  category: t.Optional(t.Union([t.String(), t.Null()])),
  generalFeedback: t.Optional(t.Union([t.String(), t.Null()])),
  answerKey: t.Optional(t.Any()),
  options: t.Optional(t.Array(optionBody)),
  matchPairs: t.Optional(t.Array(pairBody)),
};

export const questionRoutes = new Elysia({ prefix: "/api/questions" })
  .use(jwtPlugin)
  .get("/", async ({ query, headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!requireRole(user, ["admin", "teacher"])) {
      return status(403, { error: "Akses ditolak." });
    }

    const subjectId = query.subjectId;
    const rows = await db
      .select()
      .from(questions)
      .where(subjectId ? eq(questions.subjectId, subjectId) : undefined)
      .orderBy(desc(questions.createdAt));

    const details = await loadQuestionDetails(rows.map((row) => row.id));
    return { questions: details };
  })
  .post(
    "/",
    async ({ body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const limit = checkRateLimit(
        `question-create:${user.sub}`,
        RATE_LIMITS.crud.limit,
        RATE_LIMITS.crud.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [subject] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, body.subjectId))
        .limit(1);
      if (!subject) return status(400, { error: "Mapel tidak ditemukan." });

      try {
        const questionId = await createQuestion(
          body.subjectId,
          body as unknown as QuestionInput,
        );
        const [question] = await loadQuestionDetails([questionId]);
        return { question };
      } catch (error) {
        if (error instanceof QuestionInputError) {
          return status(400, { error: error.message });
        }
        throw error;
      }
    },
    {
      body: t.Object({
        subjectId: t.String(),
        ...questionContentBody,
      }),
    },
  )
  .get("/:id/usage", async ({ params, headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!requireRole(user, ["admin", "teacher"])) {
      return status(403, { error: "Akses ditolak." });
    }

    const [question] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.id, params.id))
      .limit(1);
    if (!question) return status(404, { error: "Soal tidak ditemukan." });

    return await getQuestionUsage(question.id);
  })
  .patch(
    "/:id",
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

      try {
        await updateQuestion(params.id, body as unknown as QuestionInput);
        const [question] = await loadQuestionDetails([params.id]);
        return { question };
      } catch (error) {
        if (error instanceof QuestionInputError) {
          return status(400, { error: error.message });
        }
        if (error instanceof QuestionNotFoundError) {
          return status(404, { error: error.message });
        }
        if (error instanceof QuestionConflictError) {
          const usage = await getQuestionUsage(params.id);
          return status(409, { error: error.message, usage });
        }
        throw error;
      }
    },
    { body: t.Object({ ...questionContentBody }) },
  )
  .delete(
    "/:id",
    async ({ params, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      try {
        await deleteQuestion(params.id);
      } catch (error) {
        if (error instanceof QuestionNotFoundError) {
          return status(404, { error: error.message });
        }
        if (error instanceof QuestionConflictError) {
          const usage = await getQuestionUsage(params.id);
          return status(409, { error: error.message, usage });
        }
        throw error;
      }

      await removeQuestionUploads(params.id);
      return { ok: true, id: params.id };
    },
  )
  .get("/:id", async ({ params, headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!requireRole(user, ["admin", "teacher"])) {
      return status(403, { error: "Akses ditolak." });
    }

    const [question] = await loadQuestionDetails([params.id]);
    if (!question) return status(404, { error: "Soal tidak ditemukan." });
    return { question };
  })
  .post(
    "/:id/image",
    async ({ params, body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const limit = checkRateLimit(
        `question-image:${user.sub}`,
        RATE_LIMITS.imageUpload.limit,
        RATE_LIMITS.imageUpload.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [question] = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.id, params.id))
        .limit(1);
      if (!question) return status(404, { error: "Soal tidak ditemukan." });

      let imageUrl: string;
      try {
        imageUrl = await saveUploadedFile(body.file, `questions/${question.id}`);
      } catch (error) {
        return status(400, {
          error: error instanceof Error ? error.message : "Upload gagal.",
        });
      }

      await db
        .update(questions)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(questions.id, question.id));

      return { questionId: question.id, imageUrl };
    },
    { body: t.Object({ file: t.File() }) },
  )
  .post(
    "/:id/options/:optionId/image",
    async ({ params, body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const limit = checkRateLimit(
        `question-image:${user.sub}`,
        RATE_LIMITS.imageUpload.limit,
        RATE_LIMITS.imageUpload.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [option] = await db
        .select({ id: questionOptions.id })
        .from(questionOptions)
        .where(
          and(
            eq(questionOptions.id, params.optionId),
            eq(questionOptions.questionId, params.id),
          ),
        )
        .limit(1);
      if (!option) return status(404, { error: "Opsi tidak ditemukan." });

      let imageUrl: string;
      try {
        imageUrl = await saveUploadedFile(
          body.file,
          `questions/${params.id}/options`,
        );
      } catch (error) {
        return status(400, {
          error: error instanceof Error ? error.message : "Upload gagal.",
        });
      }

      await db
        .update(questionOptions)
        .set({ imageUrl })
        .where(eq(questionOptions.id, option.id));

      return { optionId: option.id, imageUrl };
    },
    { body: t.Object({ file: t.File() }) },
  );
