import { and, count, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examSessions,
  examViolationLogs,
  exams,
  users,
} from "../db/schema";

type QueryExecutor = Pick<typeof db, "select">;

export type SessionUsage = {
  sessionId: string;
  examId: string;
  examTitle: string;
  examStatus: "draft" | "published" | "archived";
  studentId: string;
  studentName: string;
  username: string;
  sessionStatus: "started" | "in_progress" | "finished" | "suspended";
  finishedReason:
    | "submitted"
    | "time_expired"
    | "force_submit"
    | "suspended"
    | null;
  score: string | null;
  startedAt: string;
  finishedAt: string | null;
  answerCount: number;
  violationCount: number;
  screenshotCount: number;
  canCancel: boolean;
  reasons: string[];
};

/**
 * Menghitung dampak pembatalan submission sebelum admin mengonfirmasi.
 *
 * Submission hanya boleh dibatalkan jika sesi sudah selesai dan ujian tidak
 * sedang diarsipkan. Sesi yang masih berjalan tidak boleh dihapus karena
 * peserta yang sedang login akan kehilangan sesinya di tengah pengerjaan.
 */
export async function getSessionUsage(
  sessionId: string,
  executor: QueryExecutor = db,
): Promise<SessionUsage | null> {
  const [row] = await executor
    .select({
      sessionId: examSessions.id,
      examId: examSessions.examId,
      examTitle: exams.title,
      examStatus: exams.status,
      studentId: users.id,
      studentName: users.fullName,
      username: users.username,
      sessionStatus: examSessions.status,
      finishedReason: examSessions.finishedReason,
      score: examSessions.score,
      startedAt: examSessions.startedAt,
      finishedAt: examSessions.finishedAt,
    })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .innerJoin(exams, eq(exams.id, examSessions.examId))
    .where(eq(examSessions.id, sessionId))
    .limit(1);

  if (!row) return null;

  const [answerTotal] = await executor
    .select({ total: count() })
    .from(examAnswers)
    .where(eq(examAnswers.sessionId, sessionId));

  const [violationTotal] = await executor
    .select({ total: count() })
    .from(examViolationLogs)
    .where(eq(examViolationLogs.sessionId, sessionId));

  const [screenshotTotal] = await executor
    .select({ total: count() })
    .from(examViolationLogs)
    .where(
      and(
        eq(examViolationLogs.sessionId, sessionId),
        isNotNull(examViolationLogs.screenshotUrl),
      ),
    );

  const reasons: string[] = [];
  if (row.sessionStatus !== "finished") {
    reasons.push(
      "Sesi masih berjalan. Tunggu hingga peserta mengumpulkan jawaban sebelum membatalkan submission.",
    );
  }
  if (row.examStatus === "archived") {
    reasons.push(
      "Ujian sudah diarsipkan. Buka kembali status ujian jika peserta perlu mengulang.",
    );
  }

  return {
    sessionId: row.sessionId,
    examId: row.examId,
    examTitle: row.examTitle,
    examStatus: row.examStatus,
    studentId: row.studentId,
    studentName: row.studentName,
    username: row.username,
    sessionStatus: row.sessionStatus,
    finishedReason: row.finishedReason,
    score: row.score,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    answerCount: Number(answerTotal?.total ?? 0),
    violationCount: Number(violationTotal?.total ?? 0),
    screenshotCount: Number(screenshotTotal?.total ?? 0),
    canCancel: reasons.length === 0,
    reasons,
  };
}
