import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  examQuestions,
  questionMatchPairs,
  questionOptions,
  questions,
} from "../db/schema";
import type { AnswerKey, QuestionType } from "../db/schema";
import type { ParsedQuestion } from "./parsers";
import { getQuestionUsage } from "./question-usage";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class QuestionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionInputError";
  }
}

export class QuestionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionConflictError";
  }
}

export class QuestionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionNotFoundError";
  }
}

const QUESTION_TYPES = new Set<QuestionType>([
  "multiple_choice",
  "multiple_response",
  "true_false",
  "matching",
  "short_answer",
  "numerical",
  "essay",
]);

const OPTION_TYPES = new Set<QuestionType>([
  "multiple_choice",
  "multiple_response",
  "true_false",
]);

export type QuestionOptionInput = {
  id?: string;
  optionText?: string | null;
  fraction?: number;
  feedback?: string | null;
};

export type QuestionMatchPairInput = {
  id?: string;
  leftText?: string | null;
  rightText?: string | null;
};

export type QuestionInput = {
  questionType: string;
  questionText: string;
  points: number;
  category?: string | null;
  generalFeedback?: string | null;
  answerKey?: unknown;
  options?: QuestionOptionInput[];
  matchPairs?: QuestionMatchPairInput[];
};

export type NormalizedOption = {
  id?: string;
  label: string;
  optionText: string;
  fraction: number;
  feedback: string | null;
};

export type NormalizedMatchPair = {
  id?: string;
  leftText: string;
  rightText: string;
};

export type NormalizedQuestion = {
  questionType: QuestionType;
  questionText: string;
  points: number;
  category: string | null;
  generalFeedback: string | null;
  answerKey: AnswerKey;
  options: NormalizedOption[];
  matchPairs: NormalizedMatchPair[];
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text.length > 0 ? text : null;
}

function normalizeFraction(value: unknown, label: string): number {
  const fraction =
    value === undefined || value === null || value === "" ? 0 : Number(value);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new QuestionInputError(`${label} harus antara 0 dan 1.`);
  }
  return fraction;
}

function normalizeOptions(
  questionType: QuestionType,
  raw: QuestionOptionInput[] | undefined,
): NormalizedOption[] {
  if (!OPTION_TYPES.has(questionType)) return [];

  const options = Array.isArray(raw) ? raw : [];
  if (questionType === "true_false" && options.length !== 2) {
    throw new QuestionInputError(
      "Soal benar/salah harus memiliki tepat dua opsi.",
    );
  }
  if (options.length < 2) {
    throw new QuestionInputError("Soal pilihan harus memiliki minimal dua opsi.");
  }
  if (options.length > 26) {
    throw new QuestionInputError("Maksimal 26 opsi per soal.");
  }

  const normalized = options.map((option, index) => {
    const label =
      questionType === "true_false"
        ? index === 0
          ? "TRUE"
          : "FALSE"
        : String.fromCharCode(65 + index);
    const text =
      cleanText(option.optionText) ||
      (questionType === "true_false" ? (index === 0 ? "Benar" : "Salah") : "");

    return {
      id: typeof option.id === "string" && option.id ? option.id : undefined,
      label,
      optionText: text,
      fraction: normalizeFraction(option.fraction, `Nilai opsi ${label}`),
      feedback: cleanNullableText(option.feedback),
    };
  });

  if (!normalized.some((option) => option.fraction > 0)) {
    throw new QuestionInputError(
      "Minimal satu opsi harus memiliki nilai lebih dari 0.",
    );
  }

  return normalized;
}

function normalizeMatchPairs(
  questionType: QuestionType,
  raw: QuestionMatchPairInput[] | undefined,
): NormalizedMatchPair[] {
  if (questionType !== "matching") return [];

  const pairs = Array.isArray(raw) ? raw : [];
  if (pairs.length < 2) {
    throw new QuestionInputError(
      "Soal matching harus memiliki minimal dua pasangan.",
    );
  }

  return pairs.map((pair, index) => {
    const leftText = cleanText(pair.leftText);
    const rightText = cleanText(pair.rightText);
    if (!leftText || !rightText) {
      throw new QuestionInputError(
        `Pasangan matching #${index + 1} tidak boleh kosong.`,
      );
    }
    return {
      id: typeof pair.id === "string" && pair.id ? pair.id : undefined,
      leftText,
      rightText,
    };
  });
}

function normalizeAnswerKey(
  questionType: QuestionType,
  raw: unknown,
): AnswerKey {
  if (questionType === "short_answer") {
    const answerKey = raw as { accepted?: unknown } | null | undefined;
    const acceptedRaw = Array.isArray(answerKey?.accepted)
      ? answerKey.accepted
      : [];
    const accepted = acceptedRaw.map((item, index) => {
      const entry = item as { text?: unknown; fraction?: unknown };
      const text = cleanText(entry.text);
      if (!text) {
        throw new QuestionInputError(
          `Jawaban alternatif #${index + 1} tidak boleh kosong.`,
        );
      }
      return {
        text,
        fraction: normalizeFraction(
          entry.fraction ?? 1,
          `Nilai jawaban #${index + 1}`,
        ),
      };
    });

    if (accepted.length === 0) {
      throw new QuestionInputError("Minimal satu jawaban diterima.");
    }
    return { accepted };
  }

  if (questionType === "numerical") {
    const answerKey = raw as
      | { value?: unknown; tolerance?: unknown }
      | null
      | undefined;
    const value = Number(answerKey?.value);
    if (!Number.isFinite(value)) {
      throw new QuestionInputError("Nilai jawaban numerik wajib diisi.");
    }
    const tolerance =
      answerKey?.tolerance === undefined || answerKey?.tolerance === null
        ? 0
        : Number(answerKey.tolerance);
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      throw new QuestionInputError("Toleransi harus 0 atau lebih.");
    }
    return { value, tolerance };
  }

  return null;
}

export function normalizeQuestionInput(
  input: QuestionInput,
): NormalizedQuestion {
  if (!QUESTION_TYPES.has(input.questionType as QuestionType)) {
    throw new QuestionInputError("Tipe soal tidak dikenal.");
  }
  const questionType = input.questionType as QuestionType;

  const questionText = cleanText(input.questionText);
  if (!questionText) {
    throw new QuestionInputError("Teks soal wajib diisi.");
  }
  if (questionText.length > 50_000) {
    throw new QuestionInputError("Teks soal terlalu panjang.");
  }

  const points = Number(input.points);
  if (!Number.isFinite(points) || points <= 0 || points > 9999.99) {
    throw new QuestionInputError("Poin harus antara 0.01 dan 9999.99.");
  }

  const category = cleanNullableText(input.category);
  if (category && category.length > 255) {
    throw new QuestionInputError("Kategori maksimal 255 karakter.");
  }

  return {
    questionType,
    questionText,
    points,
    category,
    generalFeedback: cleanNullableText(input.generalFeedback),
    answerKey: normalizeAnswerKey(questionType, input.answerKey),
    options: normalizeOptions(questionType, input.options),
    matchPairs: normalizeMatchPairs(questionType, input.matchPairs),
  };
}

async function insertQuestionChildren(
  tx: Tx,
  questionId: string,
  question: NormalizedQuestion,
): Promise<void> {
  if (question.options.length > 0) {
    await tx.insert(questionOptions).values(
      question.options.map((option, index) => ({
        id: randomUUID(),
        questionId,
        label: option.label,
        optionText: option.optionText,
        fraction: option.fraction.toFixed(4),
        feedback: option.feedback,
        orderIndex: index,
      })),
    );
  }

  if (question.matchPairs.length > 0) {
    await tx.insert(questionMatchPairs).values(
      question.matchPairs.map((pair, index) => ({
        id: randomUUID(),
        questionId,
        leftText: pair.leftText,
        rightText: pair.rightText,
        orderIndex: index,
      })),
    );
  }
}

type ExistingOption = typeof questionOptions.$inferSelect;
type ExistingMatchPair = typeof questionMatchPairs.$inferSelect;

async function syncOptions(
  tx: Tx,
  questionId: string,
  existing: ExistingOption[],
  next: NormalizedOption[],
): Promise<void> {
  if (next.length === 0) {
    await tx
      .delete(questionOptions)
      .where(eq(questionOptions.questionId, questionId));
    return;
  }

  const existingById = new Map(existing.map((option) => [option.id, option]));
  const keptIds = new Set<string>();

  for (const option of next) {
    if (!option.id) continue;
    if (!existingById.has(option.id)) {
      throw new QuestionInputError(
        "Opsi yang disunting bukan milik soal ini.",
      );
    }
    if (keptIds.has(option.id)) {
      throw new QuestionInputError("Opsi duplikat pada permintaan.");
    }
    keptIds.add(option.id);
  }

  const removed = existing.filter((option) => !keptIds.has(option.id));
  if (removed.length > 0) {
    await tx
      .delete(questionOptions)
      .where(
        inArray(
          questionOptions.id,
          removed.map((option) => option.id),
        ),
      );
  }

  // Label opsi memiliki unique key (question_id, label). Pindahkan label lama
  // ke label sementara agar pertukaran label (mis. A <-> B) tidak bentrok.
  const retained = next.filter(
    (option): option is NormalizedOption & { id: string } => Boolean(option.id),
  );
  for (let index = 0; index < retained.length; index++) {
    await tx
      .update(questionOptions)
      .set({ label: `~${index}` })
      .where(eq(questionOptions.id, retained[index]!.id));
  }

  for (let index = 0; index < next.length; index++) {
    const option = next[index]!;
    const values = {
      label: option.label,
      optionText: option.optionText,
      fraction: option.fraction.toFixed(4),
      feedback: option.feedback,
      orderIndex: index,
    };

    if (option.id) {
      await tx
        .update(questionOptions)
        .set(values)
        .where(eq(questionOptions.id, option.id));
    } else {
      await tx.insert(questionOptions).values({
        id: randomUUID(),
        questionId,
        ...values,
      });
    }
  }
}

async function syncMatchPairs(
  tx: Tx,
  questionId: string,
  existing: ExistingMatchPair[],
  next: NormalizedMatchPair[],
): Promise<void> {
  if (next.length === 0) {
    await tx
      .delete(questionMatchPairs)
      .where(eq(questionMatchPairs.questionId, questionId));
    return;
  }

  const existingById = new Map(existing.map((pair) => [pair.id, pair]));
  const keptIds = new Set<string>();

  for (const pair of next) {
    if (!pair.id) continue;
    if (!existingById.has(pair.id)) {
      throw new QuestionInputError(
        "Pasangan matching yang disunting bukan milik soal ini.",
      );
    }
    if (keptIds.has(pair.id)) {
      throw new QuestionInputError("Pasangan matching duplikat.");
    }
    keptIds.add(pair.id);
  }

  const removed = existing.filter((pair) => !keptIds.has(pair.id));
  if (removed.length > 0) {
    await tx
      .delete(questionMatchPairs)
      .where(
        inArray(
          questionMatchPairs.id,
          removed.map((pair) => pair.id),
        ),
      );
  }

  for (let index = 0; index < next.length; index++) {
    const pair = next[index]!;
    const values = {
      leftText: pair.leftText,
      rightText: pair.rightText,
      orderIndex: index,
    };

    if (pair.id) {
      await tx
        .update(questionMatchPairs)
        .set(values)
        .where(eq(questionMatchPairs.id, pair.id));
    } else {
      await tx.insert(questionMatchPairs).values({
        id: randomUUID(),
        questionId,
        ...values,
      });
    }
  }
}

/**
 * Membuat soal manual baru beserta opsi/pasangan matching-nya.
 */
export async function createQuestion(
  subjectId: string,
  input: QuestionInput,
): Promise<string> {
  const question = normalizeQuestionInput(input);
  const questionId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(questions).values({
      id: questionId,
      subjectId,
      questionType: question.questionType,
      questionText: question.questionText,
      points: question.points.toFixed(2),
      generalFeedback: question.generalFeedback,
      answerKey: question.answerKey,
      category: question.category,
      sourceFormat: "manual",
      sourceRef: null,
      rawSource: null,
    });

    await insertQuestionChildren(tx, questionId, question);
  });

  return questionId;
}

/**
 * Menyunting soal. Hanya boleh jika soal belum dipakai sesi ujian dan tidak
 * terpasang pada ujian arsip. Opsi/pasangan diperbarui in-place agar jawaban
 * lama dan gambar opsi tetap aman.
 */
export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
): Promise<void> {
  const question = normalizeQuestionInput(input);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(questions)
      .where(eq(questions.id, questionId))
      .for("update");

    if (!existing) {
      throw new QuestionNotFoundError("Soal tidak ditemukan.");
    }

    const usage = await getQuestionUsage(questionId, tx);
    if (!usage.canEdit) {
      throw new QuestionConflictError(
        usage.reasons[0] ??
          "Soal tidak dapat disunting karena sudah dipakai ujian.",
      );
    }

    if (existing.questionType !== question.questionType) {
      await tx
        .delete(questionOptions)
        .where(eq(questionOptions.questionId, questionId));
      await tx
        .delete(questionMatchPairs)
        .where(eq(questionMatchPairs.questionId, questionId));
      await insertQuestionChildren(tx, questionId, question);
    } else {
      const existingOptions = await tx
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionId, questionId));
      const existingPairs = await tx
        .select()
        .from(questionMatchPairs)
        .where(eq(questionMatchPairs.questionId, questionId));

      await syncOptions(tx, questionId, existingOptions, question.options);
      await syncMatchPairs(tx, questionId, existingPairs, question.matchPairs);
    }

    await tx
      .update(questions)
      .set({
        questionType: question.questionType,
        questionText: question.questionText,
        points: question.points.toFixed(2),
        generalFeedback: question.generalFeedback,
        answerKey: question.answerKey,
        category: question.category,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, questionId));
  });
}

/**
 * Menghapus soal jika belum dipakai sesi ujian. Soal yang hanya terpasang pada
 * ujian draft/published tanpa sesi akan dilepas dari ujian tersebut.
 */
export async function deleteQuestion(questionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.id, questionId))
      .for("update");

    if (!existing) {
      throw new QuestionNotFoundError("Soal tidak ditemukan.");
    }

    const usage = await getQuestionUsage(questionId, tx);
    if (!usage.canDelete) {
      throw new QuestionConflictError(
        usage.reasons[0] ??
          "Soal tidak dapat dihapus karena sudah dipakai ujian.",
      );
    }

    await tx
      .delete(examQuestions)
      .where(eq(examQuestions.questionId, questionId));
    await tx.delete(questions).where(eq(questions.id, questionId));
  });
}

/**
 * Menyimpan satu soal hasil parsing beserta opsi/pasangan matching
 * dalam satu transaksi.
 */
export async function insertParsedQuestion(
  subjectId: string,
  parsed: ParsedQuestion,
  format: "aiken" | "gift",
): Promise<string> {
  const questionId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(questions).values({
      id: questionId,
      subjectId,
      questionType: parsed.questionType,
      questionText: parsed.questionText,
      points: "1.00",
      generalFeedback: parsed.generalFeedback,
      answerKey: parsed.answerKey,
      category: parsed.category,
      sourceFormat: format,
      sourceRef: parsed.sourceRef,
      rawSource: parsed.rawSource,
    });

    if (parsed.options.length > 0) {
      await tx.insert(questionOptions).values(
        parsed.options.map((option, index) => ({
          id: randomUUID(),
          questionId,
          label: option.label,
          optionText: option.text,
          fraction: option.fraction.toFixed(4),
          feedback: option.feedback,
          orderIndex: index,
        })),
      );
    }

    if (parsed.matchPairs.length > 0) {
      await tx.insert(questionMatchPairs).values(
        parsed.matchPairs.map((pair, index) => ({
          id: randomUUID(),
          questionId,
          leftText: pair.left,
          rightText: pair.right,
          orderIndex: index,
        })),
      );
    }
  });

  return questionId;
}
