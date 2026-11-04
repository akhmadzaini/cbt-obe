import type {
  AdminQuestion,
  ExamParticipantRow,
  ExamSummary,
  ExamUsage,
  Participant,
  ParticipantUsage,
  QuestionUsage,
} from "../../lib/types";

export type { ImportRow } from "../../lib/types";

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
  usage: QuestionUsage | null;
  loadingUsage: boolean;
  saving: boolean;
  error: string | null;
};

export type QuestionDeleteState = {
  question: AdminQuestion;
  usage: QuestionUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
};

export type ParticipantEditorState = {
  mode: "create" | "edit";
  participant: Participant | null;
  saving: boolean;
  error: string | null;
};

export type ParticipantDeleteState = {
  participant: Participant;
  usage: ParticipantUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
};

export type ExamParticipantsState = {
  exam: ExamSummary;
  participants: ExamParticipantRow[] | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

export type ExamCancelState = {
  exam: ExamSummary;
  usage: ExamUsage | null;
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
