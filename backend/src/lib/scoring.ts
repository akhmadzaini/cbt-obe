import type { AnswerKey, AnswerPayload, QuestionType } from "../db/schema";

export type ScoreOption = {
  id: string;
  fraction: string | number;
};

export type ScoreQuestion = {
  questionType: QuestionType;
  points: string | number;
  options: ScoreOption[];
  matchPairIds: string[];
  answerKey: AnswerKey;
};

export type ScoreAnswer = {
  selectedOptionId: string | null;
  answerPayload: AnswerPayload | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Mengembalikan skor (0..points) atau null untuk essay (butuh penilaian manual).
 */
export function scoreAnswer(
  question: ScoreQuestion,
  answer: ScoreAnswer,
): number | null {
  const points = Number(question.points);
  const payload = (answer.answerPayload ?? {}) as Record<string, unknown>;

  switch (question.questionType) {
    case "multiple_choice":
    case "true_false": {
      if (!answer.selectedOptionId) return 0;
      const option = question.options.find(
        (item) => item.id === answer.selectedOptionId,
      );
      return round2(points * (option ? Number(option.fraction) : 0));
    }

    case "multiple_response": {
      const ids = payload.option_ids;
      if (!Array.isArray(ids) || ids.length === 0) return 0;

      const selected = new Set(
        ids.filter((id): id is string => typeof id === "string"),
      );
      const correctOptions = question.options.filter(
        (option) => Number(option.fraction) > 0,
      );
      if (correctOptions.length === 0) return 0;

      let positive = 0;
      let wrong = 0;
      for (const option of question.options) {
        if (!selected.has(option.id)) continue;
        const fraction = Number(option.fraction);
        if (fraction > 0) positive += fraction;
        else wrong += 1;
      }

      // Setiap opsi salah mengurangi bagian yang setara dengan satu opsi benar.
      // Batasi kontribusi benar ke 1 lebih dulu agar memilih semua opsi benar
      // (yang fraksinya bisa berjumlah >1) tidak menghapus penalti.
      const penalty = wrong / correctOptions.length;
      const fraction = Math.max(0, Math.min(1, positive) - penalty);
      return round2(points * fraction);
    }

    case "matching": {
      const mapping = payload.mapping;
      if (!mapping || typeof mapping !== "object") return 0;
      const total = question.matchPairIds.length;
      if (total === 0) return 0;
      let correct = 0;
      for (const pairId of question.matchPairIds) {
        if ((mapping as Record<string, string>)[pairId] === pairId) correct += 1;
      }
      return round2(points * (correct / total));
    }

    case "short_answer": {
      const text = payload.text;
      if (typeof text !== "string") return 0;
      const key = question.answerKey as
        | { accepted?: { text: string; fraction: number }[] }
        | null;
      const accepted = key?.accepted ?? [];
      const normalized = normalizeText(text);
      let best = 0;
      for (const candidate of accepted) {
        if (normalizeText(candidate.text) === normalized) {
          best = Math.max(best, Number(candidate.fraction));
        }
      }
      return round2(points * Math.min(1, best));
    }

    case "numerical": {
      const value = payload.value;
      if (typeof value !== "number" || !Number.isFinite(value)) return 0;
      const key = question.answerKey as
        | { value: number; tolerance: number }
        | null;
      if (!key) return 0;
      const tolerance = Math.abs(Number(key.tolerance) || 0);
      return Math.abs(value - Number(key.value)) <= tolerance + 1e-9
        ? round2(points)
        : 0;
    }

    case "essay":
      return null;

    default:
      return 0;
  }
}
