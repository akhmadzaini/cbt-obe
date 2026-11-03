import { count, eq } from "drizzle-orm";
import { db } from "../db";
import {
  examParticipants,
  examQuestions,
  examSessions,
  exams,
} from "../db/schema";

type QueryExecutor = Pick<typeof db, "select">;

export type ExamUsage = {
  examId: string;
  title: string;
  status: "draft" | "published" | "archived";
  questionCount: number;
  participantCount: number;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  canCancel: boolean;
  reasons: string[];
};

/**
 * Menghitung pemakaian ujian untuk menentukan apakah ujian boleh dibatalkan.
 *
 * Ujian hanya boleh dibatalkan jika belum pernah ada peserta yang memulai sesi
 * ujian. Sesi yang masih berjalan, sudah selesai, maupun dihentikan tetap
 * dihitung karena semuanya menyimpan riwayat pengerjaan peserta.
 */
export async function getExamUsage(
  examId: string,
  executor: QueryExecutor = db,
): Promise<ExamUsage | null> {
  const [exam] = await executor
    .select({
      id: exams.id,
      title: exams.title,
      status: exams.status,
    })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);

  if (!exam) return null;

  const [participantTotal] = await executor
    .select({ total: count() })
    .from(examParticipants)
    .where(eq(examParticipants.examId, examId));

  const [questionTotal] = await executor
    .select({ total: count() })
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId));

  const sessionRows = await executor
    .select({
      status: examSessions.status,
      startedAt: examSessions.startedAt,
    })
    .from(examSessions)
    .where(eq(examSessions.examId, examId));

  let activeSessionCount = 0;
  let finishedSessionCount = 0;
  let firstStartedAt: Date | null = null;
  let lastStartedAt: Date | null = null;

  for (const session of sessionRows) {
    if (session.status === "started" || session.status === "in_progress") {
      activeSessionCount += 1;
    }
    if (session.status === "finished") {
      finishedSessionCount += 1;
    }
    if (!firstStartedAt || session.startedAt < firstStartedAt) {
      firstStartedAt = session.startedAt;
    }
    if (!lastStartedAt || session.startedAt > lastStartedAt) {
      lastStartedAt = session.startedAt;
    }
  }

  const sessionCount = sessionRows.length;
  const reasons: string[] = [];
  if (sessionCount > 0) {
    reasons.push(
      "Ujian sudah memiliki sesi peserta sehingga tidak dapat dibatalkan.",
    );
  }
  if (activeSessionCount > 0) {
    reasons.push("Masih ada peserta yang sedang mengerjakan ujian ini.");
  }

  return {
    examId: exam.id,
    title: exam.title,
    status: exam.status,
    questionCount: Number(questionTotal?.total ?? 0),
    participantCount: Number(participantTotal?.total ?? 0),
    sessionCount,
    activeSessionCount,
    finishedSessionCount,
    firstSessionAt: firstStartedAt ? firstStartedAt.toISOString() : null,
    lastSessionAt: lastStartedAt ? lastStartedAt.toISOString() : null,
    canCancel: sessionCount === 0,
    reasons,
  };
}
