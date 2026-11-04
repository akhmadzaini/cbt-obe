import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { examSessions } from "../../db/schema";
import { authPlugin } from "../../lib/auth-plugin";
import { RATE_LIMITS } from "../../lib/rate-limit";
import {
  finalizeSession,
  remainingSeconds,
} from "../../lib/session-service";

export const sessionControlRoutes = new Elysia({ prefix: "/api/sessions" })
  .use(authPlugin)
  .post(
    "/:id/pause",
    async ({ params, user, status }) => {
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

        const now = new Date();
        if (!session.pausedAt) {
          await tx
            .update(examSessions)
            .set({ pausedAt: now, updatedAt: now })
            .where(eq(examSessions.id, session.id));
        }

        return { ok: true as const, pausedAt: session.pausedAt ?? now };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return { pausedAt: result.pausedAt };
    },
    { auth: true },
  )
  .post(
    "/:id/resume",
    async ({ params, user, status }) => {
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

        const now = new Date();
        let deadlineAt = new Date(session.deadlineAt);
        let accumulated = session.accumulatedPauseSeconds;

        if (session.pausedAt) {
          const pausedMs = now.getTime() - new Date(session.pausedAt).getTime();
          deadlineAt = new Date(deadlineAt.getTime() + Math.max(0, pausedMs));
          accumulated += Math.max(0, Math.floor(pausedMs / 1000));
          await tx
            .update(examSessions)
            .set({
              deadlineAt,
              pausedAt: null,
              accumulatedPauseSeconds: accumulated,
              updatedAt: now,
            })
            .where(eq(examSessions.id, session.id));
        }

        return {
          ok: true as const,
          deadlineAt,
          remainingSeconds: remainingSeconds(deadlineAt),
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return {
        deadlineAt: result.deadlineAt,
        remainingSeconds: result.remainingSeconds,
      };
    },
    { auth: true },
  )
  .post(
    "/:id/heartbeat",
    async ({ params, user, status }) => {
      const [session] = await db
        .select()
        .from(examSessions)
        .where(
          and(
            eq(examSessions.id, params.id),
            eq(examSessions.userId, user.sub),
          ),
        )
        .limit(1);

      if (!session) return status(404, { error: "Sesi tidak ditemukan." });

      const now = new Date();
      await db
        .update(examSessions)
        .set({ lastHeartbeatAt: now, updatedAt: now })
        .where(eq(examSessions.id, session.id));

      return {
        serverTime: now.toISOString(),
        remainingSeconds: remainingSeconds(session.deadlineAt),
        paused: Boolean(session.pausedAt),
        status: session.status,
        strikeCount: session.strikeCount,
      };
    },
    {
      auth: {
        rateLimit: { name: "heartbeat", ...RATE_LIMITS.heartbeat },
      },
    },
  )
  .post(
    "/:id/submit",
    async ({ params, user, status }) => {
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
            alreadyFinished: true,
            score: Number(session.score ?? 0),
            gradingStatus: session.gradingStatus,
            finishedReason: session.finishedReason,
          };
        }

        const finalized = await finalizeSession(tx, session.id, "submitted");
        return {
          ok: true as const,
          alreadyFinished: false,
          score: finalized.score,
          gradingStatus: finalized.gradingStatus,
          finishedReason: "submitted",
        };
      });

      if (!result.ok) return status(result.code, { error: result.error });
      return result;
    },
    {
      auth: {
        rateLimit: { name: "submit", ...RATE_LIMITS.submit },
      },
    },
  );
