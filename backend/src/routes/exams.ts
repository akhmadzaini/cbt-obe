import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  examParticipants,
  examQuestions,
  examSessions,
  exams,
  questionMatchPairs,
  questionOptions,
  questions,
  subjects,
} from "../db/schema";
import { authenticate, jwtPlugin, requireRole } from "../lib/auth";
import {
  ExamParticipantConflictError,
  ExamParticipantError,
  getExamParticipants,
  insertExamParticipants,
  replaceExamParticipants,
  validateParticipantIds,
} from "../lib/exam-participants";
import { getExamUsage, type ExamUsage } from "../lib/exam-usage";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  RATE_LIMITS,
  rateLimitMessage,
} from "../lib/rate-limit";

function isRowReferencedError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  return code === "ER_ROW_IS_REFERENCED_2" || code === "ER_ROW_IS_REFERENCED";
}

async function loadExamQuestions(examId: string) {
  const examQuestionRows = await db
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId))
    .orderBy(asc(examQuestions.orderIndex));

  const ids = examQuestionRows.map((row) => row.questionId);
  if (ids.length === 0) return [];

  const questionRows = await db
    .select()
    .from(questions)
    .where(inArray(questions.id, ids));
  const optionRows = await db
    .select()
    .from(questionOptions)
    .where(inArray(questionOptions.questionId, ids))
    .orderBy(asc(questionOptions.orderIndex));
  const pairRows = await db
    .select()
    .from(questionMatchPairs)
    .where(inArray(questionMatchPairs.questionId, ids))
    .orderBy(asc(questionMatchPairs.orderIndex));

  const questionMap = new Map(questionRows.map((row) => [row.id, row]));

  return examQuestionRows
    .map((examQuestion) => {
      const question = questionMap.get(examQuestion.questionId);
      if (!question) return null;
      return {
        ...question,
        points: examQuestion.pointsOverride ?? question.points,
        orderIndex: examQuestion.orderIndex,
        options: optionRows.filter(
          (option) => option.questionId === question.id,
        ),
        matchPairs: pairRows.filter(
          (pair) => pair.questionId === question.id,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export const examRoutes = new Elysia({ prefix: "/api/exams" })
  .use(jwtPlugin)
  .get("/", async ({ headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!user) return status(401, { error: "Unauthorized" });

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
        `exam-create:${user.sub}`,
        RATE_LIMITS.crud.limit,
        RATE_LIMITS.crud.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

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

        if (body.questionIds && body.questionIds.length > 0) {
          const uniqueIds = [...new Set(body.questionIds)];
          await tx.insert(examQuestions).values(
            uniqueIds.map((questionId, index) => ({
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

      const [exam] = await db
        .select({ id: exams.id, title: exams.title, status: exams.status })
        .from(exams)
        .where(eq(exams.id, params.id))
        .limit(1);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      return { exam, ...(await getExamParticipants(exam.id)) };
    },
  )
  .put(
    "/:id/participants",
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
        `exam-participants:${user.sub}`,
        RATE_LIMITS.crud.limit,
        RATE_LIMITS.crud.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [exam] = await db
        .select({ id: exams.id, title: exams.title, status: exams.status })
        .from(exams)
        .where(eq(exams.id, params.id))
        .limit(1);
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
      body: t.Object({
        participantIds: t.Array(t.String()),
      }),
    },
  )
  .get(
    "/:id/usage",
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

      const usage = await getExamUsage(params.id);
      if (!usage) return status(404, { error: "Ujian tidak ditemukan." });

      return usage;
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

    const [exam] = await db
      .select()
      .from(exams)
      .where(eq(exams.id, params.id))
      .limit(1);
    if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

    return { exam, questions: await loadExamQuestions(exam.id) };
  })
  .patch(
    "/:id/status",
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

      const [exam] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, params.id))
        .limit(1);
      if (!exam) return status(404, { error: "Ujian tidak ditemukan." });

      await db
        .update(exams)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(exams.id, exam.id));

      return { exam: { id: exam.id, status: body.status } };
    },
    {
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
    async ({ params, headers, request, server, jwt, status, set }) => {
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
        `exam-delete:${user.sub}`,
        RATE_LIMITS.crud.limit,
        RATE_LIMITS.crud.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      type CancelExamResult =
        | { kind: "not_found" }
        | { kind: "conflict"; usage: ExamUsage | null }
        | { kind: "ok"; title: string };

      let result: CancelExamResult;
      try {
        result = await db.transaction(async (tx) => {
          const [exam] = await tx
            .select({ id: exams.id, title: exams.title })
            .from(exams)
            .where(eq(exams.id, params.id))
            .for("update");

          if (!exam) return { kind: "not_found" as const };

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
  )
  .post(
    "/:id/questions",
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

      const [exam] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, params.id))
        .limit(1);
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
        const found = await db
          .select({ id: questions.id })
          .from(questions)
          .where(inArray(questions.id, newIds));
        const foundIds = new Set(found.map((row) => row.id));

        const rows = newIds
          .filter((id) => foundIds.has(id))
          .map((questionId, index) => ({
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
      body: t.Object({
        questionIds: t.Array(t.String(), { minItems: 1 }),
      }),
    },
  )
  .delete(
    "/:id/questions/:questionId",
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
  );
