import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  exams,
} from "../db/schema";

type QueryExecutor = Pick<typeof db, "select">;

export type QuestionUsageExam = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  questionCount: number;
  sessionCount: number;
  activeSessionCount: number;
  answerCount: number;
};

export type QuestionUsage = {
  questionId: string;
  exams: QuestionUsageExam[];
  examCount: number;
  sessionCount: number;
  activeSessionCount: number;
  answerCount: number;
  canEdit: boolean;
  canDelete: boolean;
  reasons: string[];
};

/**
 * Menghitung pemakaian soal untuk menjaga integritas data ujian.
 *
 * Soal dianggap terkunci jika sudah dipakai pada sesi ujian apa pun, sudah
 * memiliki jawaban, atau terpasang pada ujian yang diarsipkan. Soal yang hanya
 * terpasang pada ujian draft/published tanpa sesi masih boleh disunting dan
 * dihapus (ujian akan dilepas otomatis saat soal dihapus).
 */
export async function getQuestionUsage(
  questionId: string,
  executor: QueryExecutor = db,
): Promise<QuestionUsage> {
  const refs = await executor
    .select({
      examId: examQuestions.examId,
      title: exams.title,
      status: exams.status,
    })
    .from(examQuestions)
    .innerJoin(exams, eq(exams.id, examQuestions.examId))
    .where(eq(examQuestions.questionId, questionId));

  const examIds = [...new Set(refs.map((row) => row.examId))];

  const sessionRows =
    examIds.length > 0
      ? await executor
          .select({
            id: examSessions.id,
            examId: examSessions.examId,
            status: examSessions.status,
          })
          .from(examSessions)
          .where(inArray(examSessions.examId, examIds))
      : [];

  const examQuestionRows =
    examIds.length > 0
      ? await executor
          .select({ examId: examQuestions.examId })
          .from(examQuestions)
          .where(inArray(examQuestions.examId, examIds))
      : [];

  const answerRows = await executor
    .select({
      id: examAnswers.id,
      sessionId: examAnswers.sessionId,
    })
    .from(examAnswers)
    .where(eq(examAnswers.questionId, questionId));

  const sessionsByExam = new Map<
    string,
    { total: number; active: number }
  >();
  const sessionToExam = new Map<string, string>();

  for (const session of sessionRows) {
    sessionToExam.set(session.id, session.examId);
    const entry = sessionsByExam.get(session.examId) ?? {
      total: 0,
      active: 0,
    };
    entry.total += 1;
    if (session.status === "started" || session.status === "in_progress") {
      entry.active += 1;
    }
    sessionsByExam.set(session.examId, entry);
  }

  const questionCountByExam = new Map<string, number>();
  for (const row of examQuestionRows) {
    questionCountByExam.set(
      row.examId,
      (questionCountByExam.get(row.examId) ?? 0) + 1,
    );
  }

  const answersByExam = new Map<string, number>();
  let orphanAnswerCount = 0;
  for (const answer of answerRows) {
    const examId = sessionToExam.get(answer.sessionId);
    if (!examId) {
      orphanAnswerCount += 1;
      continue;
    }
    answersByExam.set(examId, (answersByExam.get(examId) ?? 0) + 1);
  }

  const usageExams: QuestionUsageExam[] = refs
    .map((ref) => ({
      id: ref.examId,
      title: ref.title,
      status: ref.status,
      questionCount: questionCountByExam.get(ref.examId) ?? 0,
      sessionCount: sessionsByExam.get(ref.examId)?.total ?? 0,
      activeSessionCount: sessionsByExam.get(ref.examId)?.active ?? 0,
      answerCount: answersByExam.get(ref.examId) ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const sessionCount = sessionRows.length;
  const activeSessionCount = sessionRows.filter(
    (session) =>
      session.status === "started" || session.status === "in_progress",
  ).length;
  const answerCount = answerRows.length;
  const hasArchived = usageExams.some((exam) => exam.status === "archived");

  const reasons: string[] = [];
  if (hasArchived) {
    reasons.push("Soal terpasang di ujian yang sudah diarsipkan.");
  }
  if (activeSessionCount > 0) {
    reasons.push("Ujian yang memakai soal ini sedang berlangsung.");
  }
  if (sessionCount > 0) {
    reasons.push("Soal sudah dipakai pada sesi ujian.");
  }
  if (answerCount > 0) {
    reasons.push("Soal sudah memiliki jawaban peserta.");
  }
  if (orphanAnswerCount > 0) {
    reasons.push("Soal masih memiliki jawaban tanpa sesi (orphan).");
  }

  const canEdit =
    !hasArchived && sessionCount === 0 && answerCount === 0;
  const canDelete = canEdit;

  return {
    questionId,
    exams: usageExams,
    examCount: usageExams.length,
    sessionCount,
    activeSessionCount,
    answerCount,
    canEdit,
    canDelete,
    reasons,
  };
}
