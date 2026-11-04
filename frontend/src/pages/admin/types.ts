import type { AdminQuestion } from "../../lib/types";

export type ImportRow = {
  id: string;
  subjectId: string;
  format: string;
  originalFilename: string | null;
  status: string;
  totalQuestions: number;
  importedQuestions: number;
  createdAt: string;
};

export type ExamFormState = {
  title: string;
  description: string;
  durationMinutes: number;
  maxStrikes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  publish: boolean;
};

export type QuestionEditorState = {
  mode: "create" | "edit";
  question: AdminQuestion | null;
  usage: import("../../lib/types").QuestionUsage | null;
  loadingUsage: boolean;
  saving: boolean;
  error: string | null;
};

export type QuestionDeleteState = {
  question: AdminQuestion;
  usage: import("../../lib/types").QuestionUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
};

export type ParticipantEditorState = {
  mode: "create" | "edit";
  participant: import("../../lib/types").Participant | null;
  saving: boolean;
  error: string | null;
};

export type ParticipantDeleteState = {
  participant: import("../../lib/types").Participant;
  usage: import("../../lib/types").ParticipantUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
};

export type ExamParticipantsState = {
  exam: import("../../lib/types").ExamSummary;
  participants: import("../../lib/types").ExamParticipantRow[] | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

export type ExamCancelState = {
  exam: import("../../lib/types").ExamSummary;
  usage: import("../../lib/types").ExamUsage | null;
  loadingUsage: boolean;
  cancelling: boolean;
  error: string | null;
};

export type SessionResetState = {
  sessionId: string;
  studentName: string;
  username: string;
  examTitle: string;
  strikeCount: number;
  resetting: boolean;
  error: string | null;
};

export type ExamCreateConfirmState = {
  saving: boolean;
  error: string | null;
};

export type ToastState = {
  id: number;
  title: string;
  message?: string;
};
