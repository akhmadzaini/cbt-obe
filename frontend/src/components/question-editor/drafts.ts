import type { AdminQuestion, QuestionType } from "../../lib/types";

export type OptionDraft = {
  key: string;
  id?: string;
  text: string;
  fraction: number;
  feedback: string;
  hasImage: boolean;
};

export type PairDraft = {
  key: string;
  id?: string;
  left: string;
  right: string;
};

export type AcceptedDraft = {
  key: string;
  text: string;
  fraction: number;
};

export const TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Pilihan ganda" },
  { value: "multiple_response", label: "Multiple response" },
  { value: "true_false", label: "Benar / salah" },
  { value: "matching", label: "Matching" },
  { value: "short_answer", label: "Isian singkat" },
  { value: "numerical", label: "Numerik" },
  { value: "essay", label: "Essay" },
];

const OPTION_TYPES = new Set<QuestionType>([
  "multiple_choice",
  "multiple_response",
  "true_false",
]);

let rowCounter = 0;
export function newKey(): string {
  rowCounter += 1;
  return `row-${Date.now()}-${rowCounter}`;
}

export function buildOptions(
  question: AdminQuestion | null,
  type: QuestionType,
): OptionDraft[] {
  if (!OPTION_TYPES.has(type)) return [];

  const existing =
    question?.questionType === type ? question.options : [];

  if (existing.length > 0) {
    const drafts = existing.map((option) => ({
      key: newKey(),
      id: option.id,
      text: option.optionText ?? "",
      fraction: Math.round(Number(option.fraction) * 100),
      feedback: option.feedback ?? "",
      hasImage: Boolean(option.imageUrl),
    }));

    if (type === "true_false" && !drafts.some((option) => option.fraction > 0)) {
      drafts[0]!.fraction = 100;
    }
    return drafts;
  }

  if (type === "true_false") {
    return [
      {
        key: newKey(),
        text: "Benar",
        fraction: 100,
        feedback: "",
        hasImage: false,
      },
      {
        key: newKey(),
        text: "Salah",
        fraction: 0,
        feedback: "",
        hasImage: false,
      },
    ];
  }

  return [0, 1, 2, 3].map((index) => ({
    key: newKey(),
    text: "",
    fraction: index === 0 ? 100 : 0,
    feedback: "",
    hasImage: false,
  }));
}

export function buildPairs(
  question: AdminQuestion | null,
  type: QuestionType,
): PairDraft[] {
  if (type !== "matching") return [];

  if (
    question?.questionType === "matching" &&
    question.matchPairs.length > 0
  ) {
    return question.matchPairs.map((pair) => ({
      key: newKey(),
      id: pair.id,
      left: pair.leftText,
      right: pair.rightText,
    }));
  }

  return [0, 1].map(() => ({ key: newKey(), left: "", right: "" }));
}

export function buildAccepted(
  question: AdminQuestion | null,
  type: QuestionType,
): AcceptedDraft[] {
  if (type !== "short_answer") {
    return [{ key: newKey(), text: "", fraction: 100 }];
  }

  const accepted =
    question?.questionType === "short_answer"
      ? (
          question.answerKey as
            | { accepted?: { text?: string; fraction?: number }[] }
            | null
            | undefined
        )?.accepted
      : undefined;

  if (Array.isArray(accepted) && accepted.length > 0) {
    return accepted.map((answer) => ({
      key: newKey(),
      text: answer.text ?? "",
      fraction: Math.round(Number(answer.fraction ?? 1) * 100),
    }));
  }

  return [{ key: newKey(), text: "", fraction: 100 }];
}

export function buildNumerical(
  question: AdminQuestion | null,
  type: QuestionType,
): { value: string; tolerance: string } {
  if (type === "numerical" && question?.questionType === "numerical") {
    const answerKey = question.answerKey as
      | { value?: number; tolerance?: number }
      | null
      | undefined;
    return {
      value: String(answerKey?.value ?? 0),
      tolerance: String(answerKey?.tolerance ?? 0),
    };
  }
  return { value: "0", tolerance: "0" };
}

export function clampPercent(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}
