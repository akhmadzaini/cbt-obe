import { describe, expect, test } from "bun:test";
import {
  computeSessionScore,
  type RecalcAnswerInput,
  type RecalcQuestionInput,
} from "./recalc-scores";

function question(
  overrides: Partial<RecalcQuestionInput> = {},
): RecalcQuestionInput {
  return {
    questionId: "q1",
    points: 10,
    questionType: "multiple_choice",
    options: [],
    matchPairIds: [],
    answerKey: null,
    ...overrides,
  };
}

function answer(
  overrides: Partial<RecalcAnswerInput> = {},
): RecalcAnswerInput {
  return {
    questionId: "q1",
    selectedOptionId: null,
    answerPayload: null,
    scoreAwarded: null,
    ...overrides,
  };
}

describe("computeSessionScore", () => {
  test("menghitung ulang multiple response dengan penalti opsi salah", () => {
    const result = computeSessionScore(
      [
        question({
          questionType: "multiple_response",
          options: [
            { id: "a", fraction: "0.5000" },
            { id: "b", fraction: "0.5000" },
            { id: "salah", fraction: "0.0000" },
          ],
        }),
      ],
      [
        answer({
          answerPayload: { option_ids: ["a", "b", "salah"] },
          scoreAwarded: "10.00",
        }),
      ],
    );

    expect(result.score).toBe(5);
    expect(result.gradingStatus).toBe("completed");
    expect(result.changedAnswers).toBe(1);
    expect(result.answerScores.get("q1")).toBe(5);
  });

  test("mengganti skor lama yang belum memakai penalti", () => {
    const result = computeSessionScore(
      [
        question({
          questionType: "multiple_response",
          options: [
            { id: "a", fraction: 1 },
            { id: "b", fraction: 0 },
          ],
        }),
      ],
      [
        answer({
          answerPayload: { option_ids: ["a", "b"] },
          scoreAwarded: "10.00",
        }),
      ],
    );

    expect(result.score).toBe(0);
    expect(result.changedAnswers).toBe(1);
  });

  test("mempertahankan nilai essay manual", () => {
    const result = computeSessionScore(
      [question({ questionType: "essay", answerKey: null })],
      [
        answer({
          answerPayload: { text: "Jawaban essay" },
          scoreAwarded: "7.50",
        }),
      ],
    );

    expect(result.score).toBe(7.5);
    expect(result.gradingStatus).toBe("completed");
    expect(result.changedAnswers).toBe(0);
    expect(result.answerScores.get("q1")).toBe(7.5);
  });

  test("essay yang belum dinilai membuat status partial", () => {
    const result = computeSessionScore(
      [question({ questionType: "essay", answerKey: null })],
      [
        answer({
          answerPayload: { text: "Jawaban essay" },
          scoreAwarded: null,
        }),
      ],
    );

    expect(result.score).toBe(0);
    expect(result.gradingStatus).toBe("partial");
    expect(result.answerScores.get("q1")).toBeNull();
  });

  test("jawaban yang tidak ada dihitung 0 tanpa error", () => {
    const result = computeSessionScore(
      [
        question({
          questionType: "multiple_choice",
          options: [{ id: "a", fraction: 1 }],
        }),
      ],
      [],
    );

    expect(result.score).toBe(0);
    expect(result.gradingStatus).toBe("completed");
    expect(result.changedAnswers).toBe(0);
  });

  test("jawaban untuk soal yang sudah tidak terpasang diabaikan", () => {
    const result = computeSessionScore(
      [
        question({
          questionId: "q1",
          options: [{ id: "a", fraction: 1 }],
        }),
      ],
      [
        answer({
          questionId: "q1",
          selectedOptionId: "a",
          scoreAwarded: "10.00",
        }),
        answer({
          questionId: "orphan",
          selectedOptionId: "x",
          scoreAwarded: "99.00",
        }),
      ],
    );

    expect(result.score).toBe(10);
    expect(result.changedAnswers).toBe(0);
  });

  test("menghitung campuran soal otomatis dan essay", () => {
    const result = computeSessionScore(
      [
        question({
          questionId: "auto",
          points: 4,
          questionType: "multiple_choice",
          options: [{ id: "a", fraction: 1 }],
        }),
        question({
          questionId: "essay",
          points: 6,
          questionType: "essay",
        }),
      ],
      [
        answer({
          questionId: "auto",
          selectedOptionId: "a",
          scoreAwarded: null,
        }),
        answer({
          questionId: "essay",
          answerPayload: { text: "..." },
          scoreAwarded: "4.00",
        }),
      ],
    );

    expect(result.score).toBe(8);
    expect(result.gradingStatus).toBe("completed");
    expect(result.changedAnswers).toBe(1);
  });
});
