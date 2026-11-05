import type { QuestionType } from "./questions";
import type { ViolationType } from "./sessions";

export type ExamResultRow = {
  sessionId: string;
  examId: string;
  examTitle: string;
  subjectName: string | null;
  studentId: string;
  studentName: string;
  username: string;
  status: "started" | "in_progress" | "finished" | "suspended";
  score: string | null;
  maxScore: number;
  gradingStatus: "pending" | "partial" | "completed";
  finishedReason: string | null;
  startedAt: string;
  finishedAt: string | null;
  strikeCount: number;
  violationCount: number;
  lastViolationAt: string | null;
};

export type SessionCancelUsage = {
  sessionId: string;
  examId: string;
  examTitle: string;
  examStatus: "draft" | "published" | "archived";
  studentId: string;
  studentName: string;
  username: string;
  sessionStatus: "started" | "in_progress" | "finished" | "suspended";
  finishedReason: string | null;
  score: string | null;
  startedAt: string;
  finishedAt: string | null;
  answerCount: number;
  violationCount: number;
  screenshotCount: number;
  canCancel: boolean;
  reasons: string[];
};

export type ExamResultDetail = {
  session: {
    id: string;
    examId: string;
    examTitle: string;
    subjectName: string | null;
    studentId: string;
    studentName: string;
    username: string;
    status: "started" | "in_progress" | "finished" | "suspended";
    score: string | null;
    maxScore: number;
    gradingStatus: "pending" | "partial" | "completed";
    finishedReason: string | null;
    startedAt: string;
    finishedAt: string | null;
    strikeCount: number;
    violationCount: number;
  };
  questions: {
    id: string;
    orderIndex: number;
    points: string;
    questionType: QuestionType;
    questionText: string;
    imageUrl: string | null;
    options: { id: string; label: string; optionText: string | null }[];
    matchPairs: { id: string; leftText: string; rightText: string }[];
  }[];
  answers: {
    questionId: string;
    selectedOptionId: string | null;
    answerPayload: Record<string, unknown> | null;
    isFlagged: boolean;
    scoreAwarded: string | null;
    answeredAt: string;
  }[];
  violations: {
    id: string;
    violationType: ViolationType;
    strikeNumber: number;
    timestamp: string;
    screenshotUrl: string | null;
    metadata: Record<string, unknown> | null;
  }[];
};
