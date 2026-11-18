import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { questionImports, subjects } from "../db/schema";
import { authPlugin } from "../lib/auth-plugin";
import { parseQuestions, type ParseError } from "../lib/parsers";
import { insertParsedQuestion } from "../lib/questions";
import { RATE_LIMITS } from "../lib/rate-limit";

export const importRoutes = new Elysia({ prefix: "/api/imports" })
  .use(authPlugin)
  .post(
    "/",
    async ({ body, user, status }) => {
      const [subject] = await db
        .select()
        .from(subjects)
        .where(eq(subjects.id, body.subjectId))
        .limit(1);
      if (!subject) return status(400, { error: "Mapel tidak ditemukan." });

      const content = await body.file.text();
      if (!content.trim()) return status(400, { error: "File kosong." });

      const result = parseQuestions(body.format, content);
      const importId = randomUUID();

      await db.insert(questionImports).values({
        id: importId,
        subjectId: subject.id,
        format: body.format,
        originalFilename: body.file.name ?? null,
        rawContent: content,
        status: "processing",
        totalQuestions: result.questions.length,
        importedQuestions: 0,
        errorLog: result.errors.length > 0 ? result.errors : null,
        importedBy: user.sub,
      });

      let imported = 0;
      const runtimeErrors: ParseError[] = [];

      for (let index = 0; index < result.questions.length; index++) {
        try {
          await insertParsedQuestion(
            subject.id,
            result.questions[index],
            body.format,
            user.role === "admin" ? null : user.sub,
          );
          imported += 1;
        } catch (error) {
          runtimeErrors.push({
            index: index + 1,
            message: error instanceof Error ? error.message : String(error),
            raw: "",
          });
        }
      }

      const allErrors = [...result.errors, ...runtimeErrors];

      await db
        .update(questionImports)
        .set({
          status: imported > 0 ? "completed" : "failed",
          importedQuestions: imported,
          errorLog: allErrors.length > 0 ? allErrors : null,
          completedAt: new Date(),
        })
        .where(eq(questionImports.id, importId));

      return {
        importId,
        format: body.format,
        total: result.questions.length,
        imported,
        errors: allErrors,
      };
    },
    {
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "question-import", ...RATE_LIMITS.questionImport },
      },
      body: t.Object({
        subjectId: t.String(),
        format: t.Union([t.Literal("aiken"), t.Literal("gift")]),
        file: t.File(),
      }),
    },
  )
  .get(
    "/",
    async ({ user }) => {
      const rows = await db
      .select({
        id: questionImports.id,
        subjectId: questionImports.subjectId,
        format: questionImports.format,
        originalFilename: questionImports.originalFilename,
        status: questionImports.status,
        totalQuestions: questionImports.totalQuestions,
        importedQuestions: questionImports.importedQuestions,
        errorLog: questionImports.errorLog,
        createdAt: questionImports.createdAt,
        completedAt: questionImports.completedAt,
      })
      .from(questionImports)
      .where(
        and(
          user.role === "admin"
            ? undefined
            : eq(questionImports.importedBy, user.sub),
        ),
      )
      .orderBy(desc(questionImports.createdAt));

      return { imports: rows };
    },
    { auth: { roles: ["admin", "teacher"] } },
  );
