import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  examParticipants,
  examQuestions,
  examSessions,
  exams,
  subjects,
} from "../db/schema";
import {
  examScopeCondition,
  filterVisibleQuestionIds,
  findExamForUser,
} from "../lib/access";
import { authPlugin } from "../lib/auth-plugin";
import { isRowReferencedError } from "../lib/db-errors";
import {
  ExamParticipantConflictError,
  ExamParticipantError,
  getExamParticipants,
  insertExamParticipants,
  replaceExamParticipants,
  validateParticipantIds,
} from "../lib/exam-participants";
import { getExamUsage, type ExamUsage } from "../lib/exam-usage";
import { loadQuestionBundles } from "../lib/question-bundle";
import { RATE_LIMITS } from "../lib/rate-limit";

async function loadExamQuestions(examId: string) {
  const examQuestionRows = await db
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId))
    .orderBy(asc(examQuestions.orderIndex));

  const bundles = await loadQuestionBundles(
    examQuestionRows.map((row) => row.questionId),
  );

  return examQuestionRows
    .map((examQuestion) => {
      const bundle = bundles.get(examQuestion.questionId);
      if (!bundle) return null;
      return {
        ...bundle.question,
        points: examQuestion.pointsOverride ?? bundle.question.points,
        orderIndex: examQuestion.orderIndex,
        options: bundle.options,
        matchPairs: bundle.matchPairs,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export const examRoutes = new Elysia({ prefix: "/api/exams" })
  .use(authPlugin)
  .get(
    "/",
    async ({ user }) => {
      let examRows: (typeof exams.$inferSelect)[];

    if (user.role === "student") {
      const assignedRows = await db
        .select({ examId: examParticipants.examId })
        .from(examParticipants)
        .where(eq(examParticipants.userId, user.sub));
      const assignedIds = [...new Set(assignedRows.map((row) => row.examId))];
      examRows =
        assignedIds.length > 0
          ? await db
              .select()
              .from(exams)
              .where(
                and(
                  eq(exams.status, "published"),
                  inArray(exams.id, assignedIds),
                ),
              )
              .orderBy(desc(exams.createdAt))
          : [];
    } else {
      examRows = await db
        .select()
        .from(exams)
        .where(examScopeCondition(user))
        .orderBy(desc(exams.createdAt));
    }

    const subjectRows = await db.select().from(subjects);
    const subjectMap = new Map(subjectRows.map((row) => [row.id, row]));

    let participantCountMap = new Map<string, number>();
    if (user.role !== "student" && examRows.length > 0) {
      const countRows = await db
        .select({
          examId: examParticipants.examId,
          total: count(),
        })
        .from(examParticipants)
        .where(
          inArray(
            examParticipants.examId,
            examRows.map((exam) => exam.id),
          ),
        )
        .groupBy(examParticipants.examId);
      participantCountMap = new Map(
        countRows.map((row) => [row.examId, Number(row.total)]),
      );
    }

    let sessionMap = new Map<
      string,
      {
        id: string;
        status: string;
        score: string | null;
        finishedAt: Date | null;
        finishedReason: string | null;
      }
    >();

    if (user.role === "student") {
      const sessionRows = await db
        .select()
        .from(examSessions)
        .where(eq(examSessions.userId, user.sub));
      sessionMap = new Map(
        sessionRows.map((row) => [
          row.examId,
          {
            id: row.id,
            status: row.status,
            score: row.score,
            finishedAt: row.finishedAt,
            finishedReason: row.finishedReason,
          },
        ]),
      );
    }

    return {
      exams: examRows.map((exam) => ({
        ...exam,
        subjectName: subjectMap.get(exam.subjectId)?.name ?? null,
        session: sessionMap.get(exam.id) ?? null,
        ...(user.role === "student"
          ? {}
          : { participantCount: participantCountMap.get(exam.id) ?? 0 }),
      })),
    };
    },
    { auth: true },
  )
  .post(
    "/",
    async ({ body, user, status }) => {
      const [subject] = await db
        .select()
        .from(subjects)
        .where(eq(subjects.id, body.subjectId))
        .limit(1);
      if (!subject) return status(400, { error: "Mapel tidak ditemukan." });

      const startAt = body.startAt ? new Date(body.startAt) : null;
      const endAt = body.endAt ? new Date(body.endAt) : null;
      if (startAt && Number.isNaN(startAt.getTime())) {
        return status(400, { error: "startAt tidak valid." });
      }
      if (endAt && Number.isNaN(endAt.getTime())) {
        return status(400, { error: "endAt tidak valid." });
      }

      const examId = randomUUID();
      const uniqueQuestionIds = [...new Set(body.questionIds ?? [])];

      if (uniqueQuestionIds.length > 0) {
        const visibleIds = await filterVisibleQuestionIds(
          uniqueQuestionIds,
          user,
        );
        if (visibleIds.size !== uniqueQuestionIds.length) {
          return status(403, {
            error:
              "Beberapa soal tidak ditemukan atau bukan milik Anda. Muat ulang bank soal.",
          });
        }
      }

      let participantIds: string[];
      try {
        participantIds = await validateParticipantIds(
          body.participantIds ?? [],
        );
      } catch (error) {
        if (error instanceof ExamParticipantError) {
          return status(400, { error: error.message });
        }
        throw error;
      }

      await db.transaction(async (tx) => {
        await tx.insert(exams).values({
          id: examId,
          subjectId: body.subjectId,
          title: body.title,
          description: body.description ?? null,
          durationMinutes: body.durationMinutes,
          startAt,
          endAt,
          maxStrikes: body.maxStrikes ?? 3,
          shuffleQuestions: body.shuffleQuestions ?? false,
          shuffleOptions: body.shuffleOptions ?? false,
          status: "draft",
          createdBy: user.sub,
        });

        if (uniqueQuestionIds.length > 0) {
          await tx.insert(examQuestions).values(
            uniqueQuestionIds.map((questionId, index) => ({
              id: randomUUID(),
              examId,
              questionId,
              orderIndex: index,
            })),
          );
        }

        await insertExamParticipants(
          tx,
          examId,
          participantIds,
          user.sub,
        );
      });

      return { exam: { id: examId } };
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "exam-create", ...RATE_LIMITS.crud },
      },
      body: t.Object({
        subjectId: t.String(),
        title: t.String({ minLength: 1, maxLength: 200 }),
        description: t.Optional(t.String()),
        durationMinutes: t.Number({ minimum: 1 }),
        startAt: t.Optional(t.String()),
        endAt: t.Optional(t.String()),
        maxStrikes: t.Optional(t.Number({ minimum: 1 })),
        shuffleQuestions: t.Optional(t.Boolean()),
        shuffleOptions: t.Optional(t.Boolean()),
        questionIds: t.Optional(t.Array(t.String())),
        participantIds: t.Optional(t.Array(t.String())),
      }),
    },
  )
  .get(
    "/:id/participants",
    async ({ params, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      return { exam, ...(await getExamParticipants(exam.id)) };
    },
    { auth: { roles: ["admin", "teacher"] } },
  )
  .put(
    "/:id/participants",
    async ({ params, body, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });
      if (exam.status === "archived") {
        return status(409, {
          error: "Ujian yang sudah diarsipkan tidak dapat diubah pesertanya.",
        });
      }

      try {
        await replaceExamParticipants(
          exam.id,
          body.participantIds,
          user.sub,
        );
      } catch (error) {
        if (error instanceof ExamParticipantError) {
          return status(400, { error: error.message });
        }
        if (error instanceof ExamParticipantConflictError) {
          return status(409, {
            error: error.message,
            blocked: error.blocked,
          });
        }
        throw error;
      }

      return { exam, ...(await getExamParticipants(exam.id)) };
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "exam-participants", ...RATE_LIMITS.crud },
      },
      body: t.Object({
        participantIds: t.Array(t.String()),
      }),
    },
  )
  .get(
    "/:id/usage",
    async ({ params, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      return await getExamUsage(exam.id);
    },
    { auth: { roles: ["admin", "teacher"] } },
  )
  .get(
    "/:id",
    async ({ params, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      return { exam, questions: await loadExamQuestions(exam.id) };
    },
    { auth: { roles: ["admin", "teacher"] } },
  )
  .patch(
    "/:id/status",
    async ({ params, body, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      await db
        .update(exams)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(exams.id, exam.id));

      return { exam: { id: exam.id, status: body.status } };
    },
    {
      auth: { roles: ["admin", "teacher"] },
      body: t.Object({
        status: t.Union([
          t.Literal("draft"),
          t.Literal("published"),
          t.Literal("archived"),
        ]),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params, user, status }) => {
      type CancelExamResult =
        | { kind: "not_found" }
        | { kind: "conflict"; usage: ExamUsage | null }
        | { kind: "ok"; title: string };

      let result: CancelExamResult;
      try {
        result = await db.transaction(async (tx) => {
          const [exam] = await tx
            .select({
              id: exams.id,
              title: exams.title,
              createdBy: exams.createdBy,
            })
            .from(exams)
            .where(eq(exams.id, params.id))
            .for("update");

          if (!exam) return { kind: "not_found" as const };
          if (user.role !== "admin" && exam.createdBy !== user.sub) {
            return { kind: "not_found" as const };
          }

          const usage = await getExamUsage(exam.id, tx);
          if (!usage || !usage.canCancel) {
            return { kind: "conflict" as const, usage };
          }

          await tx.delete(exams).where(eq(exams.id, exam.id));
          return { kind: "ok" as const, title: exam.title };
        });
      } catch (error) {
        if (isRowReferencedError(error)) {
          const usage = await getExamUsage(params.id);
          return status(409, {
            error:
              "Ujian sudah memiliki sesi peserta dan tidak dapat dibatalkan.",
            usage,
          });
        }
        throw error;
      }

      if (result.kind === "not_found") {
        return status(404, { error: "Ujian tidak ditemukan." });
      }
      if (result.kind === "conflict") {
        return status(409, {
          error:
            result.usage?.reasons[0] ??
            "Ujian sudah memiliki sesi peserta dan tidak dapat dibatalkan.",
          usage: result.usage,
        });
      }

      return { ok: true, id: params.id, title: result.title };
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "exam-delete", ...RATE_LIMITS.crud },
      },
    },
  )
  .post(
    "/:id/questions",
    async ({ params, body, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      const existing = await db
        .select()
        .from(examQuestions)
        .where(eq(examQuestions.examId, exam.id));
      const existingIds = new Set(existing.map((row) => row.questionId));
      const nextOrder =
        existing.reduce((max, row) => Math.max(max, row.orderIndex), -1) + 1;

      const newIds = [...new Set(body.questionIds)].filter(
        (id) => !existingIds.has(id),
      );
      if (newIds.length > 0) {
        const visibleIds = await filterVisibleQuestionIds(newIds, user);
        if (visibleIds.size !== newIds.length) {
          return status(403, {
            error:
              "Beberapa soal tidak ditemukan atau bukan milik Anda. Muat ulang bank soal.",
          });
        }

        const rows = newIds.map((questionId, index) => ({
          id: randomUUID(),
          examId: exam.id,
          questionId,
          orderIndex: nextOrder + index,
        }));

        if (rows.length > 0) {
          await db.insert(examQuestions).values(rows);
        }
      }

      return { examId: exam.id, questions: await loadExamQuestions(exam.id) };
    },
    {
      auth: { roles: ["admin", "teacher"] },
      body: t.Object({
        questionIds: t.Array(t.String(), { minItems: 1 }),
      }),
    },
  )
  .delete(
    "/:id/questions/:questionId",
    async ({ params, user, status }) => {
      const exam = await findExamForUser(params.id, user);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      await db
        .delete(examQuestions)
        .where(
          and(
            eq(examQuestions.examId, params.id),
            eq(examQuestions.questionId, params.questionId),
          ),
        );

      return { ok: true };
    },
    { auth: { roles: ["admin", "teacher"] } },
  );
