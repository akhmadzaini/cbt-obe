import {
  emptyQuestion,
  type ParseError,
  type ParseResult,
  type ParsedMatchPair,
  type ParsedOption,
  type ParsedQuestion,
} from "./types";

function isEscaped(text: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) count++;
  return count % 2 === 1;
}

function findToken(text: string, token: string, from = 0): number {
  for (let i = from; i <= text.length - token.length; i++) {
    if (isEscaped(text, i)) continue;
    if (text.startsWith(token, i)) return i;
  }
  return -1;
}

function unescapeGift(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      out += text[i + 1];
      i++;
    } else {
      out += text[i];
    }
  }
  return out;
}

/** Cari '#' feedback, tetapi lewati entity HTML seperti &#39; */
function findFeedbackHash(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "#" || isEscaped(text, i)) continue;
    if (text[i - 1] === "&") {
      const entity = text.slice(i).match(/^#\d+;/);
      if (entity) {
        i += entity[0].length - 1;
        continue;
      }
    }
    return i;
  }
  return -1;
}

function splitGeneralFeedback(body: string): {
  main: string;
  general: string | null;
} {
  const index = findToken(body, "####");
  if (index === -1) return { main: body, general: null };
  return {
    main: body.slice(0, index),
    general: unescapeGift(body.slice(index + 4).trim()),
  };
}

function parseFraction(content: string): {
  fraction: number | null;
  text: string;
} {
  const match = content.match(/^%(\d+(?:[.,]\d+)?)%/);
  if (!match) return { fraction: null, text: content };
  return {
    fraction: Number.parseFloat(match[1].replace(",", ".")) / 100,
    text: content.slice(match[0].length),
  };
}

function splitFeedback(content: string): {
  text: string;
  feedback: string | null;
} {
  const index = findFeedbackHash(content);
  if (index === -1) return { text: content, feedback: null };
  return {
    text: content.slice(0, index),
    feedback: unescapeGift(content.slice(index + 1).trim()),
  };
}

function splitSegments(
  body: string,
): { marker: "=" | "~"; content: string }[] {
  const segments: { marker: "=" | "~"; content: string }[] = [];
  let current: { marker: "=" | "~"; content: string } | null = null;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (char === "\\") {
      if (current) current.content += char + (body[i + 1] ?? "");
      i++;
      continue;
    }

    if (char === "=" || char === "~") {
      if (current) segments.push(current);
      current = { marker: char, content: "" };
      continue;
    }

    if (current) current.content += char;
  }

  if (current) segments.push(current);
  return segments;
}

type Meta = {
  title: string | null;
  category: string | null;
  raw: string;
  index: number;
};

function parseBody(body: string, questionText: string, meta: Meta): ParsedQuestion {
  const { main, general } = splitGeneralFeedback(body);
  const trimmed = main.trim();

  const base = {
    questionText,
    generalFeedback: general,
    category: meta.category,
    sourceRef: meta.title ?? `GIFT #${meta.index}`,
    rawSource: meta.raw,
  };

  // Essay: blok kosong {}
  if (!trimmed) {
    return emptyQuestion({ ...base, questionType: "essay", answerKey: null });
  }

  // Numerical: {#42:0.1}
  const numerical = trimmed.match(
    /^#\s*(-?\d+(?:[.,]\d+)?)\s*(?::\s*(-?\d+(?:[.,]\d+)?))?/,
  );
  if (numerical && !trimmed.includes("=") && !trimmed.includes("~")) {
    return emptyQuestion({
      ...base,
      questionType: "numerical",
      answerKey: {
        value: Number.parseFloat(numerical[1].replace(",", ".")),
        tolerance: numerical[2]
          ? Number.parseFloat(numerical[2].replace(",", "."))
          : 0,
      },
    });
  }

  // True/False: {TRUE} / {FALSE}
  const trueFalse = trimmed.match(/^(TRUE|FALSE|T|F)\b/i);
  if (trueFalse && !trimmed.includes("=") && !trimmed.includes("~")) {
    const isTrue = trueFalse[1].toUpperCase().startsWith("T");
    const { feedback } = splitFeedback(trimmed.slice(trueFalse[0].length).trim());
    return emptyQuestion({
      ...base,
      questionType: "true_false",
      options: [
        { label: "TRUE", text: "Benar", fraction: isTrue ? 1 : 0, feedback },
        { label: "FALSE", text: "Salah", fraction: isTrue ? 0 : 1, feedback: null },
      ],
    });
  }

  const segments = splitSegments(trimmed);
  if (segments.length === 0) {
    throw new Error("Blok jawaban GIFT kosong.");
  }

  // Matching: {=kiri -> kanan =kiri2 -> kanan2}
  if (segments.some((segment) => findToken(segment.content, "->") !== -1)) {
    const pairs: ParsedMatchPair[] = [];
    for (const segment of segments) {
      const arrow = findToken(segment.content, "->");
      if (arrow === -1) {
        throw new Error("Pasangan matching tidak memiliki '->'.");
      }
      const left = unescapeGift(segment.content.slice(0, arrow).trim());
      const { text: rightText } = splitFeedback(
        segment.content.slice(arrow + 2),
      );
      const right = unescapeGift(rightText.trim());
      if (!left || !right) {
        throw new Error("Pasangan matching tidak boleh kosong.");
      }
      pairs.push({ left, right });
    }
    return emptyQuestion({ ...base, questionType: "matching", matchPairs: pairs });
  }

  const hasWrong = segments.some((segment) => segment.marker === "~");

  // Short answer: hanya '=' tanpa '~'
  if (!hasWrong) {
    const accepted = segments
      .map((segment) => {
        const { fraction, text } = parseFraction(segment.content);
        const { text: answerText } = splitFeedback(text);
        return {
          text: unescapeGift(answerText.trim()),
          fraction: fraction ?? 1,
        };
      })
      .filter((answer) => answer.text.length > 0);

    if (accepted.length === 0) {
      throw new Error("Jawaban short answer kosong.");
    }

    return emptyQuestion({
      ...base,
      questionType: "short_answer",
      answerKey: { accepted },
    });
  }

  // Multiple choice / multiple response
  const options: ParsedOption[] = segments.map((segment, index) => {
    const { fraction, text } = parseFraction(segment.content);
    const { text: optionText, feedback } = splitFeedback(text);
    return {
      label: String.fromCharCode(65 + index),
      text: unescapeGift(optionText.trim()),
      fraction: fraction ?? (segment.marker === "=" ? 1 : 0),
      feedback,
    };
  });

  const correctCount = options.filter((option) => option.fraction > 0).length;
  if (correctCount === 0) {
    throw new Error("Soal pilihan ganda tidak memiliki jawaban benar.");
  }

  // GIFT: satu tanda '=' berarti pilihan tunggal (distraktor boleh memakai
  // partial credit ~%50%). Tanpa '=' atau lebih dari satu '=' berarti
  // multiple response (semua jawaban ditandai '~').
  const equalsCount = segments.filter(
    (segment) => segment.marker === "=",
  ).length;

  return emptyQuestion({
    ...base,
    questionType: equalsCount === 1 ? "multiple_choice" : "multiple_response",
    options,
  });
}

/**
 * Parser format GIFT (Moodle).
 * Mendukung: multiple choice, multiple response, true/false, matching,
 * short answer, numerical, essay, feedback per opsi, general feedback,
 * title (::judul::), dan $CATEGORY:.
 *
 * Catatan: cloze/embedded answers belum didukung.
 */
export function parseGift(input: string): ParseResult {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const questions: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  let i = 0;
  let category: string | null = null;
  let index = 0;

  const skipNoise = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;

      if (text.startsWith("//", i)) {
        const newline = text.indexOf("\n", i);
        i = newline === -1 ? text.length : newline + 1;
        continue;
      }

      if (text.startsWith("$CATEGORY:", i)) {
        const newline = text.indexOf("\n", i);
        const line = text.slice(i, newline === -1 ? text.length : newline);
        category = line.slice("$CATEGORY:".length).trim() || null;
        i = newline === -1 ? text.length : newline + 1;
        continue;
      }

      break;
    }
  };

  while (i < text.length) {
    skipNoise();
    if (i >= text.length) break;

    const start = i;
    let title: string | null = null;

    if (text.startsWith("::", i)) {
      const endTitle = findToken(text, "::", i + 2);
      if (endTitle === -1) {
        errors.push({
          index: index + 1,
          message: "Judul GIFT tidak ditutup dengan '::'.",
          raw: text.slice(i, i + 200),
        });
        break;
      }
      title = text.slice(i + 2, endTitle).trim();
      i = endTitle + 2;
    }

    const braceStart = findToken(text, "{", i);
    if (braceStart === -1) {
      const raw = text.slice(start).trim();
      if (raw) {
        errors.push({
          index: index + 1,
          message: "Tidak menemukan blok jawaban '{...}'.",
          raw: raw.slice(0, 300),
        });
      }
      break;
    }

    const braceEnd = findToken(text, "}", braceStart + 1);
    if (braceEnd === -1) {
      errors.push({
        index: index + 1,
        message: "Blok jawaban GIFT tidak ditutup dengan '}'.",
        raw: text.slice(start, braceStart + 200),
      });
      break;
    }

    const questionText = unescapeGift(text.slice(i, braceStart).trim());
    const body = text.slice(braceStart + 1, braceEnd);
    const raw = text.slice(start, braceEnd + 1);
    index += 1;

    try {
      if (!questionText) throw new Error("Teks soal GIFT kosong.");
      questions.push(
        parseBody(body, questionText, { title, category, raw, index }),
      );
    } catch (error) {
      errors.push({
        index,
        message: error instanceof Error ? error.message : String(error),
        raw,
      });
    }

    i = braceEnd + 1;
  }

  return { questions, errors };
}
