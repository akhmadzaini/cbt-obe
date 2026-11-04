import { describe, expect, test } from "vitest";
import { formatTime, isAnswered, parseAnswers } from "./exam-utils";
import type {
  AnswerState,
  SessionPayload,
  SessionQuestion,
} from "./types";

function question(
  overrides: Partial<SessionQuestion> = {},
): SessionQuestion {
  return {
    id: "q1",
    orderIndex: 0,
    points: "1.00",
    questionType: "multiple_choice",
    questionText: "Soal contoh",
    imageUrl: null,
    options: [],
    matchPairs: [],
    rightOptions: [],
    ...overrides,
  };
}

function answer(overrides: Partial<AnswerState> = {}): AnswerState {
  return {
    selectedOptionId: null,
    answerPayload: null,
    isFlagged: false,
    ...overrides,
  };
}

function payload(
  questions: SessionQuestion[],
  answers: SessionPayload["answers"] = [],
): SessionPayload {
  return {
    session: {
      id: "sesi-1",
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-01-01T01:00:00.000Z",
      pausedAt: null,
      strikeCount: 0,
      finishedAt: null,
      finishedReason: null,
      gradingStatus: "pending",
      score: null,
      accumulatedPauseSeconds: 0,
    },
    exam: {
      id: "ujian-1",
      title: "Ujian Contoh",
      description: null,
      durationMinutes: 60,
      maxStrikes: 3,
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions,
    answers,
    remainingSeconds: 3600,
    serverTime: "2026-01-01T00:00:00.000Z",
  };
}

describe("formatTime", () => {
  test("memformat menit dan detik", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(59)).toBe("00:59");
    expect(formatTime(60)).toBe("01:00");
    expect(formatTime(3599)).toBe("59:59");
  });

  test("memformat jam bila perlu", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3661)).toBe("1:01:01");
  });

  test("tidak menampilkan angka negatif", () => {
    expect(formatTime(-10)).toBe("00:00");
  });
});

describe("parseAnswers", () => {
  test("menginisialisasi soal tanpa jawaban sebagai kosong", () => {
    const result = parseAnswers(
      payload([question({ id: "q1" }), question({ id: "q2" })]),
    );

    expect(result.q1).toEqual(answer());
    expect(result.q2).toEqual(answer());
  });

  test("memetakan jawaban yang tersimpan di server", () => {
    const result = parseAnswers(
      payload([question({ id: "q1" })], [
        {
          questionId: "q1",
          selectedOptionId: "opsi-a",
          answerPayload: null,
          isFlagged: true,
        },
      ]),
    );

    expect(result.q1).toEqual({
      selectedOptionId: "opsi-a",
      answerPayload: null,
      isFlagged: true,
    });
  });
});

describe("isAnswered", () => {
  test("mengembalikan false jika belum ada jawaban", () => {
    expect(isAnswered(question(), undefined)).toBe(false);
  });

  test("pilihan ganda dan benar/salah memakai selectedOptionId", () => {
    const selected = question({ questionType: "multiple_choice" });
    const trueFalse = question({ questionType: "true_false" });

    expect(isAnswered(selected, answer({ selectedOptionId: "a" }))).toBe(true);
    expect(isAnswered(selected, answer({ selectedOptionId: null }))).toBe(false);
    expect(isAnswered(trueFalse, answer({ selectedOptionId: "true" }))).toBe(
      true,
    );
  });

  test("multiple response memerlukan minimal satu opsi", () => {
    const multi = question({ questionType: "multiple_response" });

    expect(
      isAnswered(
        multi,
        answer({ answerPayload: { option_ids: ["a", "b"] } }),
      ),
    ).toBe(true);
    expect(
      isAnswered(multi, answer({ answerPayload: { option_ids: [] } })),
    ).toBe(false);
    expect(
      isAnswered(multi, answer({ answerPayload: { option_ids: "a" } })),
    ).toBe(false);
  });

  test("matching memerlukan minimal satu pasangan", () => {
    const matching = question({ questionType: "matching" });

    expect(
      isAnswered(
        matching,
        answer({ answerPayload: { mapping: { kiri: "kanan" } } }),
      ),
    ).toBe(true);
    expect(
      isAnswered(matching, answer({ answerPayload: { mapping: {} } })),
    ).toBe(false);
  });

  test("numerik dianggap terjawab meskipun nilainya 0", () => {
    const numerical = question({ questionType: "numerical" });

    expect(
      isAnswered(numerical, answer({ answerPayload: { value: 0 } })),
    ).toBe(true);
    expect(
      isAnswered(numerical, answer({ answerPayload: { value: "0" } })),
    ).toBe(false);
  });

  test("jawaban teks memakai text dan mengabaikan spasi kosong", () => {
    const shortAnswer = question({ questionType: "short_answer" });
    const essay = question({ questionType: "essay" });

    expect(
      isAnswered(shortAnswer, answer({ answerPayload: { text: "Jakarta" } })),
    ).toBe(true);
    expect(
      isAnswered(shortAnswer, answer({ answerPayload: { text: "   " } })),
    ).toBe(false);
    expect(
      isAnswered(essay, answer({ answerPayload: { text: "Penjelasan" } })),
    ).toBe(true);
  });
});
