import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAiken } from "./aiken";

function readSample(name: string): string {
  const path = fileURLToPath(new URL(`../../../../samples/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}

describe("parseAiken", () => {
  test("mem-parse file contoh AIKEN", () => {
    const result = parseAiken(readSample("aiken-sample.txt"));

    expect(result.errors).toHaveLength(0);
    expect(result.questions).toHaveLength(3);

    const [pertama] = result.questions;
    expect(pertama?.questionType).toBe("multiple_choice");
    expect(pertama?.questionText).toBe("Ibu kota Indonesia adalah?");
    expect(pertama?.options.map((option) => option.label)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(pertama?.options.map((option) => option.fraction)).toEqual([
      0, 1, 0, 0,
    ]);
    expect(pertama?.sourceRef).toBe("AIKEN #1");
  });

  test("mendukung CRLF dan teks soal multi-baris", () => {
    const result = parseAiken(
      [
        "Bacalah teks berikut.",
        "Teks baris kedua.",
        "A. Opsi satu",
        "B. Opsi dua",
        "ANSWER: B",
      ].join("\r\n"),
    );

    expect(result.errors).toHaveLength(0);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.questionText).toBe(
      "Bacalah teks berikut.\nTeks baris kedua.",
    );
  });

  test("melanjutkan teks opsi pada baris berikutnya", () => {
    const result = parseAiken(
      ["Soal?", "A. Opsi pertama", "lanjutan opsi", "B. Opsi kedua", "ANSWER: A"].join(
        "\n",
      ),
    );

    expect(result.errors).toHaveLength(0);
    expect(result.questions[0]?.options[0]?.text).toBe(
      "Opsi pertama\nlanjutan opsi",
    );
  });

  test("tidak melaporkan blok tanpa ANSWER di akhir input", () => {
    const result = parseAiken(["Soal?", "A. Satu", "B. Dua"].join("\n"));

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test("melaporkan ANSWER yang tidak cocok dengan label opsi", () => {
    const result = parseAiken(
      ["Soal?", "A. Satu", "B. Dua", "ANSWER: C"].join("\n"),
    );

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("ANSWER: C");
  });

  test("melaporkan blok dengan kurang dari dua opsi", () => {
    const result = parseAiken(["Soal?", "A. Satu", "ANSWER: A"].join("\n"));

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("minimal 2 opsi");
  });

  test("mengabaikan blok terakhir yang belum memiliki ANSWER", () => {
    const result = parseAiken(
      ["Soal satu?", "A. Satu", "B. Dua", "ANSWER: A", "", "Soal dua?"].join(
        "\n",
      ),
    );

    expect(result.questions).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
