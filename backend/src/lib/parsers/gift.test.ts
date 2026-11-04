import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseGift } from "./gift";

function readSample(name: string): string {
  const path = fileURLToPath(new URL(`../../../../samples/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}

describe("parseGift", () => {
  test("mem-parse seluruh tipe soal pada file contoh GIFT", () => {
    const result = parseGift(readSample("gift-sample.txt"));

    expect(result.errors).toHaveLength(0);
    expect(result.questions.map((question) => question.questionType)).toEqual([
      "multiple_choice",
      "true_false",
      "matching",
      "short_answer",
      "numerical",
      "essay",
    ]);

    const [pilihanGanda, benarSalah, matching, shortAnswer, numerik, essay] =
      result.questions;

    expect(pilihanGanda?.category).toBe("Matematika/Aljabar");
    expect(pilihanGanda?.sourceRef).toBe("Persamaan linear");
    expect(pilihanGanda?.options.map((option) => option.fraction)).toEqual([
      1, 0, 0, 0,
    ]);

    expect(benarSalah?.options.map((option) => option.label)).toEqual([
      "TRUE",
      "FALSE",
    ]);
    expect(benarSalah?.options.map((option) => option.fraction)).toEqual([1, 0]);

    expect(matching?.matchPairs).toEqual([
      { left: "Merkurius", right: "1" },
      { left: "Venus", right: "2" },
      { left: "Bumi", right: "3" },
    ]);

    expect(shortAnswer?.answerKey).toEqual({
      accepted: [
        { text: "Tokyo", fraction: 1 },
        { text: "TOKYO", fraction: 1 },
      ],
    });

    expect(numerik?.answerKey).toEqual({ value: 12, tolerance: 0.01 });
    expect(essay?.answerKey).toBeNull();
  });

  test("mem-parse partial credit dan feedback opsi", () => {
    const result = parseGift(readSample("gift-partial-sample.txt"));

    expect(result.errors).toHaveLength(0);
    expect(result.questions).toHaveLength(2);

    const [pilihanGanda, multiResponse] = result.questions;
    expect(pilihanGanda?.questionType).toBe("multiple_choice");
    expect(pilihanGanda?.options.map((option) => option.fraction)).toEqual([
      1, 0.5, 0, 0,
    ]);
    expect(pilihanGanda?.options[0]?.feedback).toBe("Benar sekali");
    expect(pilihanGanda?.options[1]?.feedback).toBe(
      "Hampir, itu ibu kota Jawa Barat",
    );

    expect(multiResponse?.questionType).toBe("multiple_response");
    expect(multiResponse?.options.map((option) => option.fraction)).toEqual([
      0.5, 0.5, 0.5, 0, 0,
    ]);
  });

  test("membaca general feedback dengan ####", () => {
    const result = parseGift("Soal? {=A ~B #### Penjelasan umum}");

    expect(result.errors).toHaveLength(0);
    expect(result.questions[0]?.generalFeedback).toBe("Penjelasan umum");
  });

  test("membaca komentar // dan $CATEGORY", () => {
    const result = parseGift(
      [
        "// komentar diabaikan",
        "$CATEGORY: IPA/Fisika",
        "::Gaya::",
        "Satuan gaya adalah? {=Newton ~Joule}",
      ].join("\n"),
    );

    expect(result.errors).toHaveLength(0);
    expect(result.questions[0]?.category).toBe("IPA/Fisika");
    expect(result.questions[0]?.sourceRef).toBe("Gaya");
  });

  test("meng-unescape karakter khusus", () => {
    const result = parseGift("Berapa hasil 2+2? {=2\\+2}");

    expect(result.errors).toHaveLength(0);
    expect(result.questions[0]?.questionType).toBe("short_answer");
    expect(result.questions[0]?.answerKey).toEqual({
      accepted: [{ text: "2+2", fraction: 1 }],
    });
  });

  test("melaporkan blok tanpa kurung kurawal", () => {
    const result = parseGift("Soal tanpa blok jawaban");

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("{...}");
  });

  test("melaporkan judul yang tidak ditutup", () => {
    const result = parseGift("::Judul tidak ditutup\nSoal? {=A ~B}");

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("Judul GIFT");
  });

  test("melaporkan blok jawaban yang tidak ditutup", () => {
    const result = parseGift("Soal? {=A ~B");

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("tidak ditutup");
  });

  test("melaporkan soal pilihan ganda tanpa jawaban benar", () => {
    const result = parseGift("Soal? {~A ~B}");

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("tidak memiliki jawaban benar");
  });

  test("melaporkan teks soal yang kosong", () => {
    const result = parseGift("::Judul:: {=A ~B}");

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("Teks soal GIFT kosong");
  });
});
