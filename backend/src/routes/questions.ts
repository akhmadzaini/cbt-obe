import { Elysia, t } from "elysia";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { questionOptions, questions, subjects } from "../db/schema";
import {
  canManageQuestion,
  canViewQuestion,
  questionScopeCondition,
} from "../lib/access";
import type { AuthUser } from "../lib/auth";
import { authPlugin } from "../lib/auth-plugin";
import { removeQuestionUploads, saveUploadedFile } from "../lib/files";
import { buildGiftExport } from "../lib/gift-export";
import {
  loadQuestionBundles,
  type QuestionBundle,
} from "../lib/question-bundle";
import { getQuestionUsage } from "../lib/question-usage";
import { RATE_LIMITS } from "../lib/rate-limit";
import {
  createQuestion,
  deleteQuestion,
  QuestionConflictError,
  QuestionInputError,
  QuestionNotFoundError,
  updateQuestion,
  type QuestionInput,
} from "../lib/questions";

async function loadQuestionDetails(questionIds: string[], user: AuthUser) {
  const bundles = await loadQuestionBundles(questionIds);

  return questionIds
    .map((id) => bundles.get(id))
    .filter((bundle): bundle is QuestionBundle => Boolean(bundle))
    .map(({ question, options, matchPairs }) => ({
      ...question,
      options,
      matchPairs,
      canManage: canManageQuestion(question.createdBy, user),
    }));
}

type QuestionAccess = {
  id: string;
  createdBy: string | null;
  canManage: boolean;
};

/**
 * Soal milik guru lain tidak boleh terlihat sama sekali (404). Soal bank
 * bersama boleh dilihat guru, tetapi hanya admin yang boleh mengubahnya.
 */
async function findQuestionAccess(
  questionId: string,
  user: AuthUser,
): Promise<QuestionAccess | null> {
  const [row] = await db
    .select({ id: questions.id, createdBy: questions.createdBy })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!row) return null;

  if (!canViewQuestion(row.createdBy, user)) return null;

  return {
    ...row,
    canManage: canManageQuestion(row.createdBy, user),
  };
}

function safeFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "mapel"
  );
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
  .use(authPlugin)
  .get(
    "/",
    async ({ query, user }) => {
      const subjectId = query.subjectId;
      const rows = await db
        .select()
        .from(questions)
        .where(
          and(
            subjectId ? eq(questions.subjectId, subjectId) : undefined,
            questionScopeCondition(user),
          ),
        )
        .orderBy(desc(questions.createdAt));

      const details = await loadQuestionDetails(
        rows.map((row) => row.id),
        user,
      );
      return { questions: details };
    },
    { auth: { roles: ["admin", "teacher"] } },
  )
  .post(
    "/",
    async ({ body, user, status }) => {
      const [subject] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, body.subjectId))
        .limit(1);
      if (!subject) return status(400, { error: "Mapel tidak ditemukan." });

      try {
        // Soal buatan admin menjadi bank soal bersama (created_by NULL).
        const questionId = await createQuestion(
          body.subjectId,
          body as unknown as QuestionInput,
          user.role === "admin" ? null : user.sub,
        );
        const [question] = await loadQuestionDetails([questionId], user);
        return { question };
      } catch (error) {
        if (error instanceof QuestionInputError) {
          return status(400, { error: error.message });
        }
        throw error;
      }
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "question-create", ...RATE_LIMITS.crud },
      },
      body: t.Object({
        subjectId: t.String(),
        ...questionContentBody,
      }),
    },
  )
  .get(
    "/export",
    async ({ query, user, status }) => {
      const subjectId = (query.subjectId ?? "").trim();
      if (!subjectId) {
        return status(400, { error: "subjectId wajib diisi." });
      }
      if (query.format && query.format !== "gift") {
        return status(400, { error: "Format export hanya mendukung gift." });
      }

      const [subject] = await db
        .select({ id: subjects.id, code: subjects.code, name: subjects.name })
        .from(subjects)
        .where(eq(subjects.id, subjectId))
        .limit(1);
      if (!subject) return status(404, { error: "Mapel tidak ditemukan." });

      const rows = await db
        .select({ id: questions.id })
        .from(questions)
        .where(
          and(
            eq(questions.subjectId, subject.id),
            questionScopeCondition(user),
          ),
        )
        .orderBy(
          asc(questions.category),
          asc(questions.createdAt),
          asc(questions.id),
        );

      const bundles = await loadQuestionBundles(rows.map((row) => row.id));
      const ordered = rows
        .map((row) => bundles.get(row.id))
        .filter((bundle): bundle is QuestionBundle => Boolean(bundle));

      const content = buildGiftExport(ordered, {
        subjectName: subject.name,
        subjectCode: subject.code,
      });
      const filename = `bank-soal-${safeFilename(subject.code || subject.name)}.txt`;

      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(Buffer.byteLength(content, "utf8")),
          "Cache-Control": "no-store",
        },
      });
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "question-export", ...RATE_LIMITS.resultsExport },
      },
      query: t.Object({
        subjectId: t.Optional(t.String()),
        format: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/:id/usage",
    async ({ params, user, status }) => {
      const access = await findQuestionAccess(params.id, user);
      if (!access) return status(404, { error: "Soal tidak ditemukan." });
      if (!access.canManage) {
        return status(403, {
          error: "Rincian pemakaian bank soal hanya dapat dilihat admin.",
        });
      }

      return await getQuestionUsage(access.id);
    },
    { auth: { roles: ["admin", "teacher"] } },
  )
  .patch(
    "/:id",
    async ({ params, body, user, status }) => {
      const access = await findQuestionAccess(params.id, user);
      if (!access) return status(404, { error: "Soal tidak ditemukan." });
      if (!access.canManage) {
        return status(403, {
          error: "Soal bank bersama hanya dapat diubah oleh admin.",
        });
      }

      try {
        await updateQuestion(params.id, body as unknown as QuestionInput);
        const [question] = await loadQuestionDetails([params.id], user);
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
    {
      auth: { roles: ["admin", "teacher"] },
      body: t.Object({ ...questionContentBody }),
    },
  )
  .delete(
    "/:id",
    async ({ params, user, status }) => {
      const access = await findQuestionAccess(params.id, user);
      if (!access) return status(404, { error: "Soal tidak ditemukan." });
      if (!access.canManage) {
        return status(403, {
          error: "Soal bank bersama hanya dapat dihapus oleh admin.",
        });
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
    { auth: { roles: ["admin", "teacher"] } },
  )
  .get(
    "/:id",
    async ({ params, user, status }) => {
      const access = await findQuestionAccess(params.id, user);
      if (!access) return status(404, { error: "Soal tidak ditemukan." });

      const [question] = await loadQuestionDetails([params.id], user);
      if (!question) return status(404, { error: "Soal tidak ditemukan." });
      return { question };
    },
    { auth: { roles: ["admin", "teacher"] } },
  )
  .post(
    "/:id/image",
    async ({ params, body, user, status }) => {
      const access = await findQuestionAccess(params.id, user);
      if (!access) return status(404, { error: "Soal tidak ditemukan." });
      if (!access.canManage) {
        return status(403, {
          error: "Soal bank bersama hanya dapat diubah oleh admin.",
        });
      }
      const question = { id: access.id };

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
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "question-image", ...RATE_LIMITS.imageUpload },
      },
      body: t.Object({ file: t.File() }),
    },
  )
  .post(
    "/:id/options/:optionId/image",
    async ({ params, body, user, status }) => {
      const access = await findQuestionAccess(params.id, user);
      if (!access) return status(404, { error: "Soal tidak ditemukan." });
      if (!access.canManage) {
        return status(403, {
          error: "Soal bank bersama hanya dapat diubah oleh admin.",
        });
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
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "question-image", ...RATE_LIMITS.imageUpload },
      },
      body: t.Object({ file: t.File() }),
    },
  );
