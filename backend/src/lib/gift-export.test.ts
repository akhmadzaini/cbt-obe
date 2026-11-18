import { describe, expect, test } from "bun:test";
import type { QuestionType } from "../db/schema";
import { parseGift } from "./parsers/gift";
import {
  buildGiftExport,
  type GiftExportBundle,
} from "./gift-export";

type BundleOptions = {
  questionType: QuestionType;
  questionText: string;
  category?: string | null;
  generalFeedback?: string | null;
  answerKey?: GiftExportBundle["question"]["answerKey"];
  options?: GiftExportBundle["options"];
  matchPairs?: GiftExportBundle["matchPairs"];
};

function bundle(input: BundleOptions): GiftExportBundle {
  return {
    question: {
      id: "q1",
      questionType: input.questionType,
      questionText: input.questionText,
      generalFeedback: input.generalFeedback ?? null,
      answerKey: input.answerKey ?? null,
      category: input.category ?? null,
    },
    options: input.options ?? [],
    matchPairs: input.matchPairs ?? [],
  };
}

function option(
  label: string,
  optionText: string,
  fraction: number,
  feedback: string | null = null,
  orderIndex = 0,
): GiftExportBundle["options"][number] {
  return {
    label,
    optionText,
    fraction: String(fraction),
    feedback,
    orderIndex,
  };
}

describe("buildGiftExport", () => {
  test("multiple choice mempertahankan teks khusus, feedback, dan partial credit", () => {
    const source = bundle({
      questionType: "multiple_choice",
      questionText: "Nilai {x} = 2? #tag -> akhir",
      category: "Matematika/Aljabar",
      generalFeedback: "Penjelasan #### umum",
      options: [
        option("A", "=2 ~x # tag", 1, "Tepat #### sekali", 0),
        option("B", "3", 0, null, 1),
        option("C", "-> 4", 0.5, "Hampir #1", 2),
      ],
    });

    const text = buildGiftExport([source], {
      subjectName: "Matematika",
      subjectCode: "MTK",
    });
    const parsed = parseGift(text);

    expect(parsed.errors).toEqual([]);
    expect(parsed.questions).toHaveLength(1);

    const question = parsed.questions[0]!;
    expect(question.questionType).toBe("multiple_choice");
    expect(question.questionText).toBe(source.question.questionText);
    expect(question.category).toBe("Matematika/Aljabar");
    expect(question.generalFeedback).toBe("Penjelasan #### umum");
    expect(question.options.map((item) => item.text)).toEqual([
      "=2 ~x # tag",
      "3",
      "-> 4",
    ]);
    expect(question.options.map((item) => item.fraction)).toEqual([1, 0, 0.5]);
    expect(question.options.map((item) => item.feedback)).toEqual([
      "Tepat #### sekali",
      null,
      "Hampir #1",
    ]);
  });

  test("multiple response tetap multiple response meski hanya satu jawaban benar", () => {
    const source = bundle({
      questionType: "multiple_response",
      questionText: "Pilih yang benar.",
      options: [
        option("A", "Satu", 1, null, 0),
        option("B", "Dua", 0, null, 1),
        option("C", "Tiga", 0.5, null, 2),
      ],
    });

    const parsed = parseGift(buildGiftExport([source]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]?.questionType).toBe("multiple_response");
    expect(parsed.questions[0]?.options.map((item) => item.fraction)).toEqual([
      1, 0, 0.5,
    ]);
  });

  test("true/false dan general feedback", () => {
    const source = bundle({
      questionType: "true_false",
      questionText: "Bumi bulat.",
      generalFeedback: "Bentuk bumi oblate.",
      options: [option("TRUE", "Benar", 0, null, 0), option("FALSE", "Salah", 1, null, 1)],
    });

    const parsed = parseGift(buildGiftExport([source]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]?.questionType).toBe("true_false");
    expect(parsed.questions[0]?.options.map((item) => item.fraction)).toEqual([
      0, 1,
    ]);
    expect(parsed.questions[0]?.generalFeedback).toBe("Bentuk bumi oblate.");
  });

  test("matching meng-escape panah dan tanda khusus", () => {
    const source = bundle({
      questionType: "matching",
      questionText: "Pasangkan.",
      matchPairs: [
        { leftText: "A -> B", rightText: "1 # satu", orderIndex: 0 },
        { leftText: "C = D", rightText: "2 ~ dua", orderIndex: 1 },
      ],
    });

    const parsed = parseGift(buildGiftExport([source]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]?.questionType).toBe("matching");
    expect(parsed.questions[0]?.matchPairs).toEqual([
      { left: "A -> B", right: "1 # satu" },
      { left: "C = D", right: "2 ~ dua" },
    ]);
  });

  test("short answer mempertahankan beberapa jawaban dan fraksi", () => {
    const source = bundle({
      questionType: "short_answer",
      questionText: "Ibu kota Jepang?",
      answerKey: {
        accepted: [
          { text: "Tokyo", fraction: 1 },
          { text: "TOKYO", fraction: 0.5 },
        ],
      },
    });

    const parsed = parseGift(buildGiftExport([source]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]?.questionType).toBe("short_answer");
    expect(parsed.questions[0]?.answerKey).toEqual({
      accepted: [
        { text: "Tokyo", fraction: 1 },
        { text: "TOKYO", fraction: 0.5 },
      ],
    });
  });

  test("numerical dan essay beserta general feedback", () => {
    const numerical = bundle({
      questionType: "numerical",
      questionText: "Akar 144?",
      answerKey: { value: 12, tolerance: 0.01 },
    });
    const essay = bundle({
      questionType: "essay",
      questionText: "Jelaskan fotosintesis.",
      generalFeedback: "Sebutkan cahaya, air, CO2.",
    });

    const parsed = parseGift(buildGiftExport([numerical, essay]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions.map((item) => item.questionType)).toEqual([
      "numerical",
      "essay",
    ]);
    expect(parsed.questions[0]?.answerKey).toEqual({
      value: 12,
      tolerance: 0.01,
    });
    expect(parsed.questions[1]?.generalFeedback).toBe(
      "Sebutkan cahaya, air, CO2.",
    );
  });

  test("kategori di-reset ketika soal berikutnya tidak berkategori", () => {
    const first = bundle({
      questionType: "essay",
      questionText: "Soal satu.",
      category: "IPA/Fisika",
    });
    const second = bundle({
      questionType: "essay",
      questionText: "Soal dua.",
      category: null,
    });

    const parsed = parseGift(buildGiftExport([first, second]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions.map((item) => item.category)).toEqual([
      "IPA/Fisika",
      null,
    ]);
  });

  test("soal dengan data tidak lengkap dilewati tanpa merusak file", () => {
    const valid = bundle({
      questionType: "essay",
      questionText: "Soal valid.",
    });
    const invalid = bundle({
      questionType: "multiple_choice",
      questionText: "Tanpa jawaban benar.",
      options: [option("A", "A", 0, null, 0), option("B", "B", 0, null, 1)],
    });

    const text = buildGiftExport([invalid, valid]);
    const parsed = parseGift(text);

    expect(parsed.errors).toEqual([]);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]?.questionText).toBe("Soal valid.");
    expect(text).toContain("dilewati");
  });
});
