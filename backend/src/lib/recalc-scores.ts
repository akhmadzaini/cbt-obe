import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { examAnswers, examQuestions, examSessions } from "../db/schema";
import type { AnswerKey, AnswerPayload, QuestionType } from "../db/schema";
import { loadQuestionBundles } from "./question-bundle";
import { scoreAnswer } from "./scoring";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RecalcQuestionInput = {
  questionId: string;
  points: string | number;
  questionType: QuestionType;
  options: { id: string; fraction: string | number }[];
  matchPairIds: string[];
  answerKey: AnswerKey;
};

export type RecalcAnswerInput = {
  questionId: string;
  selectedOptionId: string | null;
  answerPayload: AnswerPayload | null;
  scoreAwarded: string | null;
};

export type RecalcTotals = {
  score: number;
  gradingStatus: "partial" | "completed";
  answerScores: Map<string, number | null>;
  changedAnswers: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Menghitung ulang skor satu sesi dari jawaban yang tersimpan.
 *
 * - Soal non-essay dihitung dengan aturan `scoreAnswer()` terbaru.
 * - Nilai essay manual dipertahankan; essay yang belum dinilai membuat sesi
 *   berstatus `partial`.
 * - Jawaban yang tidak lagi terpasang pada ujian diabaikan (sama seperti
 *   `finalizeSession`).
 */
export function computeSessionScore(
  questions: RecalcQuestionInput[],
  answers: RecalcAnswerInput[],
): RecalcTotals {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );

  let total = 0;
  let hasUngradedEssay = false;
  let changedAnswers = 0;
  const answerScores = new Map<string, number | null>();

  for (const question of questions) {
    const answer = answerMap.get(question.questionId);

    if (question.questionType === "essay") {
      if (!answer) continue;

      const existing =
        answer.scoreAwarded === null ? null : Number(answer.scoreAwarded);
      if (existing === null || !Number.isFinite(existing)) {
        hasUngradedEssay = true;
        answerScores.set(question.questionId, null);
        continue;
      }

      total += existing;
      answerScores.set(question.questionId, existing);
      continue;
    }

    const score = answer
      ? scoreAnswer(
          {
            questionType: question.questionType,
            points: question.points,
            options: question.options,
            matchPairIds: question.matchPairIds,
            answerKey: question.answerKey,
          },
          {
            selectedOptionId: answer.selectedOptionId,
            answerPayload: answer.answerPayload,
          },
        )
      : 0;

    const nextScore = score === null ? 0 : score;
    if (answer) {
      const previous =
        answer.scoreAwarded === null ? null : Number(answer.scoreAwarded);
      if (
        previous === null ||
        !Number.isFinite(previous) ||
        Math.abs(previous - nextScore) > 0.004
      ) {
        changedAnswers += 1;
      }
    }

    total += nextScore;
    answerScores.set(question.questionId, nextScore);
  }

  return {
    score: round2(total),
    gradingStatus: hasUngradedEssay ? "partial" : "completed",
    answerScores,
    changedAnswers,
  };
}

export type RecalcSessionResult = {
  sessionId: string;
  examId: string;
  userId: string;
  oldScore: number;
  newScore: number;
  oldGradingStatus: "pending" | "partial" | "completed";
  newGradingStatus: "partial" | "completed";
  changedAnswers: number;
  changed: boolean;
  skipped: boolean;
};

/**
 * Menghitung ulang satu sesi. Hanya sesi `finished` yang diproses.
 * `apply=false` menjalankan mode pratinjau tanpa menulis apa pun.
 */
export async function recalculateSessionScores(
  sessionId: string,
  options: { apply: boolean },
): Promise<RecalcSessionResult | null> {
  return db.transaction(async (tx): Promise<RecalcSessionResult | null> => {
    const [session] = await tx
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .for("update");

    if (!session) return null;

    if (session.status !== "finished") {
      return {
        sessionId: session.id,
        examId: session.examId,
        userId: session.userId,
        oldScore: Number(session.score ?? 0),
        newScore: Number(session.score ?? 0),
        oldGradingStatus: session.gradingStatus,
        newGradingStatus:
          session.gradingStatus === "pending"
            ? "partial"
            : session.gradingStatus,
        changedAnswers: 0,
        changed: false,
        skipped: true,
      };
    }

    const examQuestionRows = await tx
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.examId, session.examId))
      .orderBy(asc(examQuestions.orderIndex));

    const bundles = await loadQuestionBundles(
      examQuestionRows.map((row) => row.questionId),
      tx,
    );

    const questions: RecalcQuestionInput[] = examQuestionRows
      .map((examQuestion): RecalcQuestionInput | null => {
        const bundle = bundles.get(examQuestion.questionId);
        if (!bundle) return null;

        return {
          questionId: examQuestion.questionId,
          points: examQuestion.pointsOverride ?? bundle.question.points,
          questionType: bundle.question.questionType,
          options: bundle.options.map((option) => ({
            id: option.id,
            fraction: option.fraction,
          })),
          matchPairIds: bundle.matchPairs.map((pair) => pair.id),
          answerKey: bundle.question.answerKey,
        };
      })
      .filter(
        (question): question is RecalcQuestionInput => question !== null,
      );

    const answerRows = await tx
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, session.id));

    const totals = computeSessionScore(
      questions,
      answerRows.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        answerPayload: answer.answerPayload,
        scoreAwarded: answer.scoreAwarded,
      })),
    );

    const oldScore = round2(Number(session.score ?? 0));
    const changed =
      Math.abs(oldScore - totals.score) > 0.004 ||
      session.gradingStatus !== totals.gradingStatus ||
      totals.changedAnswers > 0;

    if (options.apply && changed) {
      await writeRecalculatedScores(tx, session.id, totals, answerRows);
    }

    return {
      sessionId: session.id,
      examId: session.examId,
      userId: session.userId,
      oldScore,
      newScore: totals.score,
      oldGradingStatus: session.gradingStatus,
      newGradingStatus: totals.gradingStatus,
      changedAnswers: totals.changedAnswers,
      changed,
      skipped: false,
    };
  });
}

async function writeRecalculatedScores(
  tx: Tx,
  sessionId: string,
  totals: RecalcTotals,
  answerRows: (typeof examAnswers.$inferSelect)[],
): Promise<void> {
  for (const answer of answerRows) {
    const next = totals.answerScores.get(answer.questionId);
    if (next === undefined || next === null) continue;

    const previous =
      answer.scoreAwarded === null ? null : Number(answer.scoreAwarded);
    if (
      previous !== null &&
      Number.isFinite(previous) &&
      Math.abs(previous - next) <= 0.004
    ) {
      continue;
    }

    await tx
      .update(examAnswers)
      .set({ scoreAwarded: next.toFixed(2) })
      .where(eq(examAnswers.id, answer.id));
  }

  await tx
    .update(examSessions)
    .set({
      score: totals.score.toFixed(2),
      gradingStatus: totals.gradingStatus,
      updatedAt: new Date(),
    })
    .where(eq(examSessions.id, sessionId));
}
