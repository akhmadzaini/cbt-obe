import { eq } from "drizzle-orm";
import { db } from "../db";
import { examSessions } from "../db/schema";

export type ParticipantUsage = {
  userId: string;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  lastSessionAt: string | null;
  canDelete: boolean;
  reasons: string[];
};

export async function getParticipantUsage(
  userId: string,
): Promise<ParticipantUsage> {
  const rows = await db
    .select({
      id: examSessions.id,
      status: examSessions.status,
      startedAt: examSessions.startedAt,
      finishedAt: examSessions.finishedAt,
    })
    .from(examSessions)
    .where(eq(examSessions.userId, userId));

  const activeSessionCount = rows.filter(
    (row) => row.status === "started" || row.status === "in_progress",
  ).length;
  const finishedSessionCount = rows.filter(
    (row) => row.status === "finished",
  ).length;
  const lastSessionAt = rows.reduce<Date | null>((latest, row) => {
    const candidate = row.finishedAt ?? row.startedAt;
    if (!candidate) return latest;
    if (!latest || candidate.getTime() > latest.getTime()) return candidate;
    return latest;
  }, null);

  const reasons: string[] = [];
  if (activeSessionCount > 0) {
    reasons.push("Peserta memiliki sesi ujian yang sedang berlangsung.");
  }
  if (rows.length > 0) {
    reasons.push(`Peserta sudah memiliki ${rows.length} sesi ujian.`);
  }

  return {
    userId,
    sessionCount: rows.length,
    activeSessionCount,
    finishedSessionCount,
    lastSessionAt: lastSessionAt ? lastSessionAt.toISOString() : null,
    canDelete: rows.length === 0,
    reasons,
  };
}
