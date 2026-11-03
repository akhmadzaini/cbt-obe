export type Role = "admin" | "teacher" | "student";

export type AdminTab =
  | "bank"
  | "exam"
  | "grading"
  | "participants"
  | "results"
  | "system";

export type User = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};

export type QuestionType =
  | "multiple_choice"
  | "multiple_response"
  | "true_false"
  | "matching"
  | "short_answer"
  | "numerical"
  | "essay";

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

export type Subject = {
  id: string;
  code: string;
  name: string;
};

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

export type ImportResult = {
  importId: string;
  format: string;
  total: number;
  imported: number;
  errors: { index: number; message: string; raw: string }[];
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

export type Participant = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

export type ParticipantInput = {
  username: string;
  fullName: string;
  password?: string;
  isActive: boolean;
};

export type ParticipantUsage = {
  userId: string;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  lastSessionAt: string | null;
  canDelete: boolean;
  reasons: string[];
};

export type UserImportError = {
  row: number;
  username: string;
  message: string;
};

export type UserImportResult = {
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: UserImportError[];
};

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


export type BackupScope = "full" | "database" | "uploads";

export type SystemStatus = {
  backupEnabled: boolean;
  maintenance: boolean;
  maintenanceMessage: string | null;
  activeJobId: string | null;
  databaseBytes: number;
  uploadsBytes: number;
  uploadsFiles: number;
  backupCount: number;
  backupBytes: number;
  diskFreeBytes: number | null;
  activeSessions: number;
  backupRetentionCount: number;
  maxUploadMb: number;
};

export type BackupRow = {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  type: string;
  includeUploads: boolean;
  tables: Record<string, number>;
};

export type SystemJob = {
  id: string;
  type: "backup" | "restore" | "reset";
  status: "running" | "done" | "failed";
  step: string;
  progress: number;
  error: string | null;
  result: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
};

export type SystemEventRow = {
  id: string;
  actorId: string | null;
  actorUsername: string;
  action: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};
