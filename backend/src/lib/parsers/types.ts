import type { AnswerKey, QuestionType } from "../../db/schema";

export type ParsedOption = {
  label: string;
  text: string;
  fraction: number;
  feedback: string | null;
};

export type ParsedMatchPair = {
  left: string;
  right: string;
};

export type ParsedQuestion = {
  questionType: QuestionType;
  questionText: string;
  options: ParsedOption[];
  matchPairs: ParsedMatchPair[];
  answerKey: AnswerKey;
  generalFeedback: string | null;
  category: string | null;
  sourceRef: string | null;
  rawSource: string;
};

export type ParseError = {
  index: number;
  message: string;
  raw: string;
};

export type ParseResult = {
  questions: ParsedQuestion[];
  errors: ParseError[];
};

export function emptyQuestion(
  partial: Partial<ParsedQuestion> & { questionText: string },
): ParsedQuestion {
  return {
    questionType: "multiple_choice",
    options: [],
    matchPairs: [],
    answerKey: null,
    generalFeedback: null,
    category: null,
    sourceRef: null,
    rawSource: "",
    ...partial,
  };
}
