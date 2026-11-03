import {
  emptyQuestion,
  type ParseError,
  type ParseResult,
  type ParsedOption,
  type ParsedQuestion,
} from "./types";

type Draft = {
  textLines: string[];
  options: ParsedOption[];
  answer: string | null;
};

/**
 * Parser format AIKEN.
 *
 * Contoh:
 *   Ibu kota Indonesia adalah?
 *   A. Bandung
 *   B. Jakarta
 *   C. Surabaya
 *   ANSWER: B
 *
 * AIKEN hanya mendukung satu jawaban benar (multiple_choice).
 */
export function parseAiken(input: string): ParseResult {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const questions: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  let draft: Draft | null = null;
  let blockIndex = 0;

  const flush = () => {
    if (!draft) return;
    blockIndex += 1;

    if (draft.options.length < 2) {
      errors.push({
        index: blockIndex,
        message: "Blok AIKEN harus memiliki minimal 2 opsi jawaban.",
        raw: [...draft.textLines, ...draft.options.map((o) => o.label)].join(
          "\n",
        ),
      });
      draft = null;
      return;
    }

    if (!draft.answer) {
      errors.push({
        index: blockIndex,
        message: "Blok AIKEN tidak memiliki baris ANSWER:.",
        raw: draft.textLines.join("\n"),
      });
      draft = null;
      return;
    }

    const answerExists = draft.options.some((o) => o.label === draft!.answer);
    if (!answerExists) {
      errors.push({
        index: blockIndex,
        message: `ANSWER: ${draft.answer} tidak cocok dengan label opsi manapun.`,
        raw: draft.textLines.join("\n"),
      });
      draft = null;
      return;
    }

    const questionText = draft.textLines.join("\n").trim();
    if (!questionText) {
      errors.push({
        index: blockIndex,
        message: "Teks soal AIKEN kosong.",
        raw: "",
      });
      draft = null;
      return;
    }

    const options = draft.options.map((option) => ({
      ...option,
      fraction: option.label === draft!.answer ? 1 : 0,
    }));

    questions.push(
      emptyQuestion({
        questionType: "multiple_choice",
        questionText,
        options,
        sourceRef: `AIKEN #${blockIndex}`,
        rawSource: [
          questionText,
          ...draft.options.map((o) => `${o.label}. ${o.text}`),
          `ANSWER: ${draft.answer}`,
        ].join("\n"),
      }),
    );

    draft = null;
  };

  for (const line of lines) {
    const answerMatch = line.match(/^\s*ANSWER\s*:\s*([A-Za-z])\s*$/i);
    if (answerMatch) {
      if (draft) {
        draft.answer = answerMatch[1].toUpperCase();
        flush();
      }
      continue;
    }

    const optionMatch = line.match(/^\s*([A-Za-z])[.)]\s+(.*)$/);
    if (optionMatch) {
      if (!draft) draft = { textLines: [], options: [], answer: null };
      draft.options.push({
        label: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim(),
        fraction: 0,
        feedback: null,
      });
      continue;
    }

    if (line.trim() === "") continue;

    if (!draft) {
      draft = { textLines: [line], options: [], answer: null };
    } else if (draft.options.length > 0) {
      // Lanjutan teks opsi terakhir.
      const last = draft.options[draft.options.length - 1];
      last.text = `${last.text}\n${line.trim()}`.trim();
    } else {
      draft.textLines.push(line);
    }
  }

  // Blok terakhir tanpa ANSWER tidak dianggap soal.
  return { questions, errors };
}
