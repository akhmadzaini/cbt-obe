import type { AnswerKey, QuestionType } from "../db/schema";

export type GiftExportBundle = {
  question: {
    id: string;
    questionType: QuestionType;
    questionText: string;
    generalFeedback: string | null;
    answerKey: AnswerKey;
    category: string | null;
  };
  options: {
    label: string;
    optionText: string | null;
    fraction: string;
    feedback: string | null;
    orderIndex: number;
  }[];
  matchPairs: {
    leftText: string;
    rightText: string;
    orderIndex: number;
  }[];
};

export type GiftExportMeta = {
  subjectName?: string | null;
  subjectCode?: string | null;
};

/**
 * Escape teks di luar blok jawaban. `{` harus di-escape agar parser tidak
 * menganggapnya awal blok jawaban; `\` dan `}` ikut diamankan.
 */
function escapeQuestionText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

/** Escape isi opsi/jawaban agar tidak dianggap marker, feedback, atau panah. */
function escapeToken(value: string): string {
  return escapeQuestionText(value)
    .replace(/=/g, "\\=")
    .replace(/~/g, "\\~")
    .replace(/#/g, "\\#")
    .replace(/->/g, "\\->");
}

/** Escape feedback agar `####` tidak memotong general feedback lebih awal. */
function escapeFeedback(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\}/g, "\\}")
    .replace(/#/g, "\\#");
}

function fractionOf(value: string): number {
  const fraction = Number.parseFloat(value);
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/** Parser membagi persen dengan 100; pertahankan hingga 4 angka desimal. */
function percentToken(fraction: number): string {
  const percent = Math.round(fraction * 100 * 10_000) / 10_000;
  return `%${percent}%`;
}

function optionFeedback(value: string | null): string {
  return value ? `#${escapeFeedback(value)}` : "";
}

function buildOptionSegment(
  option: GiftExportBundle["options"][number],
  marker: "=" | "~",
): string {
  const fraction = fractionOf(option.fraction);
  const percent =
    marker === "="
      ? fraction === 1
        ? ""
        : percentToken(fraction)
      : fraction > 0
        ? percentToken(fraction)
        : "";

  return `${marker}${percent}${escapeToken(option.optionText ?? "")}${optionFeedback(option.feedback)}`;
}

function buildMultipleChoice(bundle: GiftExportBundle): string | null {
  const options = [...bundle.options].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  if (options.length === 0) return null;

  const correctIndex = options.findIndex(
    (option) => fractionOf(option.fraction) > 0,
  );
  if (correctIndex === -1) return null;

  return options
    .map((option, index) =>
      buildOptionSegment(option, index === correctIndex ? "=" : "~"),
    )
    .join("");
}

function buildMultipleResponse(bundle: GiftExportBundle): string | null {
  const options = [...bundle.options].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  if (options.length === 0) return null;
  if (!options.some((option) => fractionOf(option.fraction) > 0)) return null;

  // Tanpa marker "=" agar parser tetap menganggapnya multiple response,
  // termasuk saat hanya ada satu opsi benar.
  return options
    .map((option) => buildOptionSegment(option, "~"))
    .join("");
}

function buildTrueFalse(bundle: GiftExportBundle): string | null {
  const options = [...bundle.options].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const trueOption = options.find(
    (option) => option.label.toUpperCase() === "TRUE",
  );
  const falseOption = options.find(
    (option) => option.label.toUpperCase() === "FALSE",
  );

  const trueFraction = trueOption ? fractionOf(trueOption.fraction) : 0;
  const falseFraction = falseOption ? fractionOf(falseOption.fraction) : 0;
  if (trueFraction === 0 && falseFraction === 0) return null;

  // Parser GIFT tidak menyimpan feedback per opsi untuk true/false, jadi
  // hanya nilai benar/salah yang diekspor.
  return falseFraction > trueFraction ? "FALSE" : "TRUE";
}

function buildMatching(bundle: GiftExportBundle): string | null {
  const pairs = [...bundle.matchPairs].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  if (pairs.length === 0) return null;
  if (pairs.some((pair) => !pair.leftText.trim() || !pair.rightText.trim())) {
    return null;
  }

  return pairs
    .map(
      (pair) =>
        `=${escapeToken(pair.leftText)}->${escapeToken(pair.rightText)}`,
    )
    .join("");
}

function buildShortAnswer(bundle: GiftExportBundle): string | null {
  const key = bundle.question.answerKey as
    | { accepted?: { text?: unknown; fraction?: unknown }[] }
    | null
    | undefined;
  const accepted = Array.isArray(key?.accepted) ? key.accepted : [];

  const segments = accepted
    .map((entry) => {
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text) return null;
      const fraction =
        typeof entry.fraction === "number" && Number.isFinite(entry.fraction)
          ? Math.min(1, Math.max(0, entry.fraction))
          : 1;
      return `=${fraction === 1 ? "" : percentToken(fraction)}${escapeToken(text)}`;
    })
    .filter((segment): segment is string => segment !== null);

  return segments.length > 0 ? segments.join("") : null;
}

function buildNumerical(bundle: GiftExportBundle): string | null {
  const key = bundle.question.answerKey as
    | { value?: unknown; tolerance?: unknown }
    | null
    | undefined;
  if (typeof key?.value !== "number" || !Number.isFinite(key.value)) {
    return null;
  }

  const tolerance =
    typeof key.tolerance === "number" && Number.isFinite(key.tolerance)
      ? key.tolerance
      : 0;

  return `#${key.value}${tolerance === 0 ? "" : `:${tolerance}`}`;
}

function buildBody(bundle: GiftExportBundle): string | null {
  switch (bundle.question.questionType) {
    case "multiple_choice":
      return buildMultipleChoice(bundle);
    case "multiple_response":
      return buildMultipleResponse(bundle);
    case "true_false":
      return buildTrueFalse(bundle);
    case "matching":
      return buildMatching(bundle);
    case "short_answer":
      return buildShortAnswer(bundle);
    case "numerical":
      return buildNumerical(bundle);
    case "essay":
      return "";
    default:
      return null;
  }
}

function sanitizeCategory(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

/**
 * Menghasilkan teks GIFT yang kompatibel dengan `parseGift()` milik aplikasi.
 * Poin dan gambar soal tidak didukung format GIFT sehingga tidak disertakan.
 */
export function buildGiftExport(
  bundles: GiftExportBundle[],
  meta: GiftExportMeta = {},
): string {
  const lines: string[] = [];
  const subjectLabel =
    meta.subjectName && meta.subjectCode
      ? `${meta.subjectName} (${meta.subjectCode})`
      : (meta.subjectName ?? meta.subjectCode ?? null);

  lines.push("// Bank soal CBT - format GIFT");
  if (subjectLabel) {
    lines.push(`// Mapel: ${subjectLabel.replace(/\r?\n/g, " ")}`);
  }
  lines.push(
    "// Catatan: poin soal, gambar soal, dan gambar opsi tidak disertakan oleh format GIFT.",
  );
  lines.push("");

  let previousCategory: string | null = null;
  let number = 0;

  for (const bundle of bundles) {
    const body = buildBody(bundle);
    if (body === null) {
      number += 1;
      lines.push(
        `// Soal ${number} dilewati: data tidak lengkap untuk format GIFT.`,
        "",
      );
      continue;
    }

    const category = bundle.question.category
      ? sanitizeCategory(bundle.question.category)
      : null;

    if (category !== previousCategory) {
      lines.push(category ? `$CATEGORY: ${category}` : "$CATEGORY:");
      previousCategory = category;
    }

    number += 1;
    const general = bundle.question.generalFeedback
      ? `####${escapeFeedback(bundle.question.generalFeedback)}`
      : "";

    lines.push(`::Soal ${number}::`);
    lines.push(
      `${escapeQuestionText(bundle.question.questionText)} {${body}${general}}`,
    );
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
