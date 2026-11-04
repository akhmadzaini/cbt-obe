export type QuestionType =
  | "multiple_choice"
  | "multiple_response"
  | "true_false"
  | "matching"
  | "short_answer"
  | "numerical"
  | "essay";

export type QuestionAnswerKey =
  | { accepted: { text: string; fraction: number }[] }
  | { value: number; tolerance: number }
  | Record<string, unknown>
  | null;

export type AdminQuestion = {
  id: string;
  subjectId: string;
  questionType: QuestionType;
  questionText: string;
  imageUrl: string | null;
  points: string;
  category: string | null;
  generalFeedback: string | null;
  answerKey: QuestionAnswerKey;
  sourceFormat: string;
  sourceRef: string | null;
  options: {
    id: string;
    label: string;
    optionText: string | null;
    imageUrl: string | null;
    fraction: string;
    feedback: string | null;
    orderIndex: number;
  }[];
  matchPairs: {
    id: string;
    leftText: string;
    rightText: string;
    orderIndex: number;
  }[];
};

export type QuestionInputOption = {
  id?: string;
  optionText: string;
  fraction: number;
  feedback: string | null;
};

export type QuestionInputMatchPair = {
  id?: string;
  leftText: string;
  rightText: string;
};

export type QuestionInput = {
  questionType: QuestionType;
  questionText: string;
  points: number;
  category: string | null;
  generalFeedback: string | null;
  answerKey: QuestionAnswerKey;
  options: QuestionInputOption[];
  matchPairs: QuestionInputMatchPair[];
};

export type QuestionUsageExam = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  questionCount: number;
  sessionCount: number;
  activeSessionCount: number;
  answerCount: number;
};

export type QuestionUsage = {
  questionId: string;
  exams: QuestionUsageExam[];
  examCount: number;
  sessionCount: number;
  activeSessionCount: number;
  answerCount: number;
  canEdit: boolean;
  canDelete: boolean;
  reasons: string[];
};
