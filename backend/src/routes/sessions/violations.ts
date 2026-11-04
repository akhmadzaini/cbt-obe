import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { examSessions, examViolationLogs, exams } from "../../db/schema";
import { authPlugin } from "../../lib/auth-plugin";
import { saveUploadedFile } from "../../lib/files";
import { RATE_LIMITS } from "../../lib/rate-limit";
import {
  STRIKE_TYPES,
  VIOLATION_TYPES,
  type ViolationType,
} from "../../lib/session-violations";
import { finalizeSession } from "../../lib/session-service";

export const sessionViolationRoutes = new Elysia({ prefix: "/api/sessions" })
  .use(authPlugin)
  .post(
    "/:id/violations",
    async ({ params, body, user, status }) => {
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
      auth: {
        rateLimit: { name: "violation", ...RATE_LIMITS.violation },
      },
      body: t.Object({
        violationType: t.String(),
        metadata: t.Optional(t.Any()),
        screenshot: t.Optional(t.File()),
      }),
    },
  );
