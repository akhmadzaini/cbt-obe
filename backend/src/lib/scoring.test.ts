import { describe, expect, test } from "bun:test";
import { scoreAnswer, type ScoreQuestion } from "./scoring";

function question(overrides: Partial<ScoreQuestion> = {}): ScoreQuestion {
  return {
    questionType: "multiple_choice",
    points: 10,
    options: [],
    matchPairIds: [],
    answerKey: null,
    ...overrides,
  };
}

describe("scoreAnswer", () => {
  describe("multiple_choice / true_false", () => {
    const options = [
      { id: "benar", fraction: 1 },
      { id: "salah", fraction: 0 },
      { id: "parsial", fraction: 0.5 },
    ];

    test("memberi skor penuh untuk opsi dengan fraction 1", () => {
      const score = scoreAnswer(
        question({ options }),
        { selectedOptionId: "benar", answerPayload: null },
      );
      expect(score).toBe(10);
    });

    test("memberi skor 0 untuk opsi salah", () => {
      const score = scoreAnswer(
        question({ options }),
        { selectedOptionId: "salah", answerPayload: null },
      );
      expect(score).toBe(0);
    });

    test("menghitung partial credit sesuai fraction", () => {
      const score = scoreAnswer(
        question({ options }),
        { selectedOptionId: "parsial", answerPayload: null },
      );
      expect(score).toBe(5);
    });

    test("mengembalikan 0 jika belum memilih opsi", () => {
      const score = scoreAnswer(
        question({ options }),
        { selectedOptionId: null, answerPayload: null },
      );
      expect(score).toBe(0);
    });

    test("mengembalikan 0 jika opsi tidak dikenal", () => {
      const score = scoreAnswer(
        question({ options }),
        { selectedOptionId: "tidak-ada", answerPayload: null },
      );
      expect(score).toBe(0);
    });

    test("membulatkan hasil ke dua desimal", () => {
      const score = scoreAnswer(
        question({
          options: [{ id: "opsi", fraction: 1 / 3 }],
        }),
        { selectedOptionId: "opsi", answerPayload: null },
      );
      expect(score).toBe(3.33);
    });

    test("true_false memakai aturan yang sama", () => {
      const score = scoreAnswer(
        question({
          questionType: "true_false",
          options: [
            { id: "true", fraction: "0.0000" },
            { id: "false", fraction: "1.0000" },
          ],
        }),
        { selectedOptionId: "false", answerPayload: null },
      );
      expect(score).toBe(10);
    });
  });

  describe("multiple_response", () => {
    const options = [
      { id: "a", fraction: 0.5 },
      { id: "b", fraction: 0.5 },
      { id: "c", fraction: 0.5 },
      { id: "salah", fraction: 0 },
    ];

    test("menjumlahkan fraction semua opsi terpilih", () => {
      const score = scoreAnswer(
        question({ questionType: "multiple_response", options }),
        { selectedOptionId: null, answerPayload: { option_ids: ["a", "b"] } },
      );
      expect(score).toBe(10);
    });

    test("membatasi total fraction maksimal 1", () => {
      const score = scoreAnswer(
        question({ questionType: "multiple_response", options }),
        {
          selectedOptionId: null,
          answerPayload: { option_ids: ["a", "b", "c"] },
        },
      );
      expect(score).toBe(10);
    });

    test("partial credit saat hanya sebagian dipilih", () => {
      const score = scoreAnswer(
        question({ questionType: "multiple_response", options }),
        { selectedOptionId: null, answerPayload: { option_ids: ["a"] } },
      );
      expect(score).toBe(5);
    });

    test("mengembalikan 0 untuk daftar kosong", () => {
      const score = scoreAnswer(
        question({ questionType: "multiple_response", options }),
        { selectedOptionId: null, answerPayload: { option_ids: [] } },
      );
      expect(score).toBe(0);
    });

    test("mengembalikan 0 jika payload bukan array", () => {
      const score = scoreAnswer(
        question({ questionType: "multiple_response", options }),
        { selectedOptionId: null, answerPayload: { option_ids: "a" } },
      );
      expect(score).toBe(0);
    });
  });

  describe("matching", () => {
    const matchPairIds = ["p1", "p2", "p3", "p4"];

    test("memberi skor penuh jika semua pasangan benar", () => {
      const score = scoreAnswer(
        question({ questionType: "matching", matchPairIds }),
        {
          selectedOptionId: null,
          answerPayload: {
            mapping: { p1: "p1", p2: "p2", p3: "p3", p4: "p4" },
          },
        },
      );
      expect(score).toBe(10);
    });

    test("menghitung proporsi pasangan yang benar", () => {
      const score = scoreAnswer(
        question({ questionType: "matching", matchPairIds }),
        {
          selectedOptionId: null,
          answerPayload: {
            mapping: { p1: "p1", p2: "p2", p3: "p4", p4: "p3" },
          },
        },
      );
      expect(score).toBe(5);
    });

    test("mengembalikan 0 jika mapping kosong", () => {
      const score = scoreAnswer(
        question({ questionType: "matching", matchPairIds }),
        { selectedOptionId: null, answerPayload: { mapping: {} } },
      );
      expect(score).toBe(0);
    });

    test("mengembalikan 0 jika tidak ada pasangan", () => {
      const score = scoreAnswer(
        question({ questionType: "matching", matchPairIds: [] }),
        { selectedOptionId: null, answerPayload: { mapping: {} } },
      );
      expect(score).toBe(0);
    });
  });

  describe("short_answer", () => {
    const answerKey = {
      accepted: [
        { text: "Jakarta", fraction: 1 },
        { text: "DKI Jakarta", fraction: 0.5 },
      ],
    };

    test("mencocokkan teks dengan normalisasi spasi dan huruf", () => {
      const score = scoreAnswer(
        question({ questionType: "short_answer", answerKey }),
        { selectedOptionId: null, answerPayload: { text: "  jAkArTa  " } },
      );
      expect(score).toBe(10);
    });

    test("menghitung partial credit dari jawaban alternatif", () => {
      const score = scoreAnswer(
        question({ questionType: "short_answer", answerKey }),
        { selectedOptionId: null, answerPayload: { text: "DKI  Jakarta" } },
      );
      expect(score).toBe(5);
    });

    test("mengembalikan 0 jika tidak ada jawaban yang cocok", () => {
      const score = scoreAnswer(
        question({ questionType: "short_answer", answerKey }),
        { selectedOptionId: null, answerPayload: { text: "Bandung" } },
      );
      expect(score).toBe(0);
    });

    test("mengembalikan 0 jika jawaban bukan string", () => {
      const score = scoreAnswer(
        question({ questionType: "short_answer", answerKey }),
        { selectedOptionId: null, answerPayload: { text: 123 } },
      );
      expect(score).toBe(0);
    });
  });

  describe("numerical", () => {
    const answerKey = { value: 12, tolerance: 0.01 };

    test("menerima nilai di dalam toleransi", () => {
      const score = scoreAnswer(
        question({ questionType: "numerical", answerKey }),
        { selectedOptionId: null, answerPayload: { value: 12.005 } },
      );
      expect(score).toBe(10);
    });

    test("menolak nilai di luar toleransi", () => {
      const score = scoreAnswer(
        question({ questionType: "numerical", answerKey }),
        { selectedOptionId: null, answerPayload: { value: 12.02 } },
      );
      expect(score).toBe(0);
    });

    test("mengembalikan 0 jika payload bukan angka", () => {
      const score = scoreAnswer(
        question({ questionType: "numerical", answerKey }),
        { selectedOptionId: null, answerPayload: { value: "12" } },
      );
      expect(score).toBe(0);
    });

    test("mengembalikan 0 jika answerKey tidak ada", () => {
      const score = scoreAnswer(
        question({ questionType: "numerical", answerKey: null }),
        { selectedOptionId: null, answerPayload: { value: 12 } },
      );
      expect(score).toBe(0);
    });
  });

  test("essay mengembalikan null agar dinilai manual", () => {
    const score = scoreAnswer(
      question({ questionType: "essay" }),
      { selectedOptionId: null, answerPayload: { text: "Jawaban essay" } },
    );
    expect(score).toBeNull();
  });
});
