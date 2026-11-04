export type Subject = {
  id: string;
  code: string;
  name: string;
};

export type ExamSummary = {
  id: string;
  subjectId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startAt: string | null;
  endAt: string | null;
  maxStrikes: number;
  status: "draft" | "published" | "archived";
  subjectName: string | null;
  participantCount?: number;
  session: {
    id: string;
    status: string;
    score: string | null;
    finishedAt: string | null;
    finishedReason: string | null;
  } | null;
};

export type ExamParticipantRow = {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  assigned: boolean;
  assignedAt: string | null;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  lastSessionAt: string | null;
};

export type ExamUsage = {
  examId: string;
  title: string;
  status: "draft" | "published" | "archived";
  questionCount: number;
  participantCount: number;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  canCancel: boolean;
  reasons: string[];
};

export type ExamParticipantsResponse = {
  exam: {
    id: string;
    title: string;
    status: "draft" | "published" | "archived";
  };
  examId: string;
  assignedCount: number;
  participants: ExamParticipantRow[];
};
