import type { QuestionType } from "./questions";

export type SessionQuestion = {
  id: string;
  orderIndex: number;
  points: string;
  questionType: QuestionType;
  questionText: string;
  imageUrl: string | null;
  options: {
    id: string;
    label: string;
    text: string | null;
    imageUrl: string | null;
  }[];
  matchPairs: { id: string; leftText: string }[];
  rightOptions: { id: string; text: string }[];
};

export type AnswerState = {
  selectedOptionId: string | null;
  answerPayload: Record<string, unknown> | null;
  isFlagged: boolean;
};

export type SessionPayload = {
  session: {
    id: string;
    status: "started" | "in_progress" | "finished" | "suspended";
    startedAt: string;
    deadlineAt: string;
    pausedAt: string | null;
    strikeCount: number;
    finishedAt: string | null;
    finishedReason: string | null;
    gradingStatus: "pending" | "partial" | "completed";
    score: string | null;
    accumulatedPauseSeconds: number;
  };
  exam: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    maxStrikes: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
  };
  questions: SessionQuestion[];
  answers: {
    questionId: string;
    selectedOptionId: string | null;
    answerPayload: Record<string, unknown> | null;
    isFlagged: boolean;
  }[];
  remainingSeconds: number;
  serverTime: string;
};

export type ViolationType =
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "dom_injection"
  | "contextmenu"
  | "copy_paste"
  | "keyboard_shortcut";

export type ViolationResponse = {
  forceSubmit: boolean;
  strikeCount: number;
  maxStrikes: number;
  sessionStatus: string;
  score?: number;
};

export type PendingGradingEssay = {
  answerId: string | null;
  questionId: string;
  questionText: string;
  answerText: string;
  points: string;
  scoreAwarded: string | null;
};

export type PendingGradingSession = {
  sessionId: string;
  examId: string;
  examTitle: string;
  studentName: string;
  username: string;
  finishedAt: string | null;
  score: string | null;
  gradingStatus: string;
  essays: PendingGradingEssay[];
};
