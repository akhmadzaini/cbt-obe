import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  exams,
} from "../db/schema";
import { loadQuestionBundles } from "./question-bundle";
import { scoreAnswer } from "./scoring";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FinishedReason =
  | "submitted"
  | "time_expired"
  | "force_submit"
  | "suspended";

export function remainingSeconds(deadlineAt: Date | string): number {
  return Math.max(
    0,
    Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000),
  );
}

function seedFrom(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Pengacakan deterministik (xorshift32) dengan seed tetap, sehingga urutan
 * soal/opsi tidak berubah saat sesi di-resume atau halaman di-reload.
 */
export function shuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let state = seedFrom(seed) || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function buildSessionPayload(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(examSessions)
    .where(and(eq(examSessions.id, sessionId), eq(examSessions.userId, userId)))
    .limit(1);

  if (!session) return null;

  const [exam] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, session.examId))
    .limit(1);

  if (!exam) return null;

  const examQuestionRows = await db
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, session.examId))
    .orderBy(examQuestions.orderIndex);

  const questionIds = examQuestionRows.map((row) => row.questionId);
  const bundles = await loadQuestionBundles(questionIds);

  const orderedQuestions = examQuestionRows
    .map((examQuestion) => {
      const bundle = bundles.get(examQuestion.questionId);
      if (!bundle) return null;
      const { question } = bundle;

      const options = bundle.options.map((option) => ({
        id: option.id,
        label: option.label,
        text: option.optionText,
        imageUrl: option.imageUrl,
      }));

      const pairs = bundle.matchPairs;

      return {
        id: question.id,
        orderIndex: examQuestion.orderIndex,
        points: examQuestion.pointsOverride ?? question.points,
        questionType: question.questionType,
        questionText: question.questionText,
        imageUrl: question.imageUrl,
        options: exam.shuffleOptions
          ? shuffle(options, `${session.id}:${question.id}:options`)
          : options,
        matchPairs: pairs.map((pair) => ({
          id: pair.id,
          leftText: pair.leftText,
        })),
        rightOptions: shuffle(
          pairs.map((pair) => ({ id: pair.id, text: pair.rightText })),
          `${session.id}:${question.id}:right`,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const sessionQuestions = exam.shuffleQuestions
    ? shuffle(orderedQuestions, `${session.id}:questions`)
    : orderedQuestions;

  const answerRows = await db
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.sessionId, sessionId));

  return {
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      deadlineAt: session.deadlineAt,
      pausedAt: session.pausedAt,
      strikeCount: session.strikeCount,
      finishedAt: session.finishedAt,
      finishedReason: session.finishedReason,
      gradingStatus: session.gradingStatus,
      score: session.score,
      accumulatedPauseSeconds: session.accumulatedPauseSeconds,
    },
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      maxStrikes: exam.maxStrikes,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
    },
    questions: sessionQuestions,
    answers: answerRows.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId,
      answerPayload: answer.answerPayload,
      isFlagged: answer.isFlagged,
    })),
    remainingSeconds: remainingSeconds(session.deadlineAt),
    serverTime: new Date().toISOString(),
  };
}

/**
 * Menghitung skor seluruh jawaban dan menutup sesi. Harus dipanggil
 * di dalam transaksi dengan baris exam_sessions sudah dikunci.
 */
export async function finalizeSession(
  tx: Tx,
  sessionId: string,
  reason: FinishedReason,
): Promise<{ score: number; gradingStatus: "pending" | "partial" | "completed" }> {
  const [session] = await tx
    .select()
    .from(examSessions)
    .where(eq(examSessions.id, sessionId))
    .for("update");

  if (!session) throw new Error("Sesi tidak ditemukan.");

  if (session.status === "finished") {
    return {
      score: Number(session.score ?? 0),
      gradingStatus: session.gradingStatus,
    };
  }

  const examQuestionRows = await tx
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, session.examId));

  const questionIds = examQuestionRows.map((row) => row.questionId);
  const answerRows = await tx
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.sessionId, sessionId));

  const answerMap = new Map(
    answerRows.map((answer) => [answer.questionId, answer]),
  );

  let total = 0;
  let hasManualGrading = false;

  if (questionIds.length > 0) {
    const bundles = await loadQuestionBundles(questionIds, tx);

    for (const examQuestion of examQuestionRows) {
      const bundle = bundles.get(examQuestion.questionId);
      if (!bundle) continue;
      const { question } = bundle;

      const answer = answerMap.get(question.id);
      const options = bundle.options.map((option) => ({
        id: option.id,
        fraction: option.fraction,
      }));
      const pairIds = bundle.matchPairs.map((pair) => pair.id);
      const points = examQuestion.pointsOverride ?? question.points;

      const score = answer
        ? scoreAnswer(
            {
              questionType: question.questionType,
              points,
              options,
              matchPairIds: pairIds,
              answerKey: question.answerKey,
            },
            {
              selectedOptionId: answer.selectedOptionId,
              answerPayload: answer.answerPayload,
            },
          )
        : 0;

      if (score === null) {
        hasManualGrading = true;
      } else {
        total += score;
      }

      if (answer) {
        await tx
          .update(examAnswers)
          .set({ scoreAwarded: score === null ? null : score.toFixed(2) })
          .where(eq(examAnswers.id, answer.id));
      }
    }
  }

  const gradingStatus = hasManualGrading ? "partial" : "completed";

  await tx
    .update(examSessions)
    .set({
      status: "finished",
      finishedAt: new Date(),
      finishedReason: reason,
      score: total.toFixed(2),
      gradingStatus,
      pausedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(examSessions.id, sessionId));

  return { score: total, gradingStatus };
}
