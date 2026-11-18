import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  datetime,
  decimal,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export type QuestionType =
  | "multiple_choice"
  | "multiple_response"
  | "true_false"
  | "matching"
  | "short_answer"
  | "numerical"
  | "essay";

/** Kunci jawaban untuk tipe non-opsi. */
export type AnswerKey =
  | { accepted: { text: string; fraction: number }[] } // short_answer
  | { value: number; tolerance: number } // numerical
  | Record<string, unknown>
  | null;

/** Jawaban peserta untuk tipe non-pilihan-tunggal. */
export type AnswerPayload =
  | { option_ids: string[] } // multiple_response
  | { mapping: Record<string, string> } // matching (left pair id -> right pair id)
  | { text: string } // short_answer / essay
  | { value: number } // numerical
  | Record<string, unknown>;

const id = () => char("id", { length: 36 }).primaryKey();
const now = () => sql`CURRENT_TIMESTAMP`;

export const users = mysqlTable(
  "users",
  {
    id: id(),
    username: varchar("username", { length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    role: mysqlEnum("role", ["admin", "teacher", "student"])
      .notNull()
      .default("student"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: datetime("created_at").notNull().default(now()),
    updatedAt: datetime("updated_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("uq_users_username").on(t.username)],
);

export const subjects = mysqlTable(
  "subjects",
  {
    id: id(),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    createdAt: datetime("created_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("uq_subjects_code").on(t.code)],
);

export const exams = mysqlTable(
  "exams",
  {
    id: id(),
    subjectId: char("subject_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    durationMinutes: int("duration_minutes").notNull(),
    startAt: datetime("start_at"),
    endAt: datetime("end_at"),
    maxStrikes: int("max_strikes").notNull().default(3),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    status: mysqlEnum("status", ["draft", "published", "archived"])
      .notNull()
      .default("draft"),
    createdBy: char("created_by", { length: 36 }).notNull(),
    createdAt: datetime("created_at").notNull().default(now()),
    updatedAt: datetime("updated_at").notNull().default(now()),
  },
  (t) => [
    index("idx_exams_subject").on(t.subjectId),
    index("idx_exams_status").on(t.status),
  ],
);

export const questions = mysqlTable(
  "questions",
  {
    id: id(),
    subjectId: char("subject_id", { length: 36 }).notNull(),
    questionType: mysqlEnum("question_type", [
      "multiple_choice",
      "multiple_response",
      "true_false",
      "matching",
      "short_answer",
      "numerical",
      "essay",
    ])
      .notNull()
      .default("multiple_choice"),
    questionText: text("question_text").notNull(),
    imageUrl: varchar("image_url", { length: 500 }),
    points: decimal("points", { precision: 6, scale: 2 })
      .notNull()
      .default("1.00"),
    generalFeedback: text("general_feedback"),
    answerKey: json("answer_key").$type<AnswerKey>(),
    category: varchar("category", { length: 255 }),
    sourceFormat: mysqlEnum("source_format", ["manual", "aiken", "gift"])
      .notNull()
      .default("manual"),
    sourceRef: varchar("source_ref", { length: 255 }),
    rawSource: text("raw_source"),
    /**
     * Pemilik soal. `null` berarti bank soal bersama (buatan admin / data
     * lama) yang boleh dipakai semua guru tetapi hanya admin yang mengubah.
     */
    createdBy: char("created_by", { length: 36 }),
    createdAt: datetime("created_at").notNull().default(now()),
    updatedAt: datetime("updated_at").notNull().default(now()),
  },
  (t) => [
    index("idx_questions_subject_category").on(t.subjectId, t.category),
    index("idx_questions_created_by").on(t.createdBy),
  ],
);

export const questionOptions = mysqlTable(
  "question_options",
  {
    id: id(),
    questionId: char("question_id", { length: 36 }).notNull(),
    label: varchar("label", { length: 10 }).notNull(),
    optionText: text("option_text"),
    imageUrl: varchar("image_url", { length: 500 }),
    fraction: decimal("fraction", { precision: 5, scale: 4 })
      .notNull()
      .default("0.0000"),
    feedback: text("feedback"),
    orderIndex: int("order_index").notNull().default(0),
  },
  (t) => [uniqueIndex("uq_question_options_label").on(t.questionId, t.label)],
);

export const questionMatchPairs = mysqlTable(
  "question_match_pairs",
  {
    id: id(),
    questionId: char("question_id", { length: 36 }).notNull(),
    leftText: text("left_text").notNull(),
    rightText: text("right_text").notNull(),
    orderIndex: int("order_index").notNull().default(0),
  },
  (t) => [index("idx_match_pairs_question").on(t.questionId)],
);

export const examQuestions = mysqlTable(
  "exam_questions",
  {
    id: id(),
    examId: char("exam_id", { length: 36 }).notNull(),
    questionId: char("question_id", { length: 36 }).notNull(),
    orderIndex: int("order_index").notNull(),
    pointsOverride: decimal("points_override", { precision: 6, scale: 2 }),
  },
  (t) => [
    uniqueIndex("uq_exam_questions_question").on(t.examId, t.questionId),
    uniqueIndex("uq_exam_questions_order").on(t.examId, t.orderIndex),
  ],
);

export const examParticipants = mysqlTable(
  "exam_participants",
  {
    id: id(),
    examId: char("exam_id", { length: 36 }).notNull(),
    userId: char("user_id", { length: 36 }).notNull(),
    assignedBy: char("assigned_by", { length: 36 }),
    assignedAt: datetime("assigned_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("uq_exam_participants_exam_user").on(t.examId, t.userId),
    index("idx_exam_participants_user").on(t.userId),
  ],
);

export const examSessions = mysqlTable(
  "exam_sessions",
  {
    id: id(),
    examId: char("exam_id", { length: 36 }).notNull(),
    userId: char("user_id", { length: 36 }).notNull(),
    status: mysqlEnum("status", [
      "started",
      "in_progress",
      "finished",
      "suspended",
    ])
      .notNull()
      .default("started"),
    startedAt: datetime("started_at").notNull(),
    deadlineAt: datetime("deadline_at").notNull(),
    pausedAt: datetime("paused_at"),
    accumulatedPauseSeconds: int("accumulated_pause_seconds")
      .notNull()
      .default(0),
    finishedAt: datetime("finished_at"),
    finishedReason: mysqlEnum("finished_reason", [
      "submitted",
      "time_expired",
      "force_submit",
      "suspended",
    ]),
    gradingStatus: mysqlEnum("grading_status", [
      "pending",
      "partial",
      "completed",
    ])
      .notNull()
      .default("pending"),
    lastHeartbeatAt: datetime("last_heartbeat_at"),
    strikeCount: int("strike_count").notNull().default(0),
    score: decimal("score", { precision: 7, scale: 2 }),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    userAgent: varchar("user_agent", { length: 512 }).notNull(),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
    createdAt: datetime("created_at").notNull().default(now()),
    updatedAt: datetime("updated_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("uq_exam_sessions_exam_user").on(t.examId, t.userId),
    index("idx_exam_sessions_status").on(t.status),
  ],
);

export const examAnswers = mysqlTable(
  "exam_answers",
  {
    id: id(),
    sessionId: char("session_id", { length: 36 }).notNull(),
    questionId: char("question_id", { length: 36 }).notNull(),
    selectedOptionId: char("selected_option_id", { length: 36 }),
    answerPayload: json("answer_payload").$type<AnswerPayload>(),
    isFlagged: boolean("is_flagged").notNull().default(false),
    scoreAwarded: decimal("score_awarded", { precision: 6, scale: 2 }),
    answeredAt: datetime("answered_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_exam_answers_session_question").on(
      t.sessionId,
      t.questionId,
    ),
    index("idx_exam_answers_session").on(t.sessionId),
  ],
);

export const examViolationLogs = mysqlTable(
  "exam_violation_logs",
  {
    id: id(),
    sessionId: char("session_id", { length: 36 }).notNull(),
    /**
     * ID idempoten dari klien. Dipakai untuk mencegah strike ganda saat
     * request normal dan fallback `keepalive` mengirim kejadian yang sama.
     */
    clientEventId: varchar("client_event_id", { length: 64 }),
    violationType: mysqlEnum("violation_type", [
      "tab_hidden",
      "window_blur",
      "fullscreen_exit",
      "dom_injection",
      "contextmenu",
      "copy_paste",
      "keyboard_shortcut",
    ]).notNull(),
    strikeNumber: int("strike_number").notNull(),
    screenshotUrl: varchar("screenshot_url", { length: 500 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    timestamp: datetime("timestamp").notNull().default(now()),
  },
  (t) => [
    index("idx_violation_session_time").on(t.sessionId, t.timestamp),
    uniqueIndex("uq_violation_session_event").on(
      t.sessionId,
      t.clientEventId,
    ),
  ],
);

export const questionImports = mysqlTable(
  "question_imports",
  {
    id: id(),
    subjectId: char("subject_id", { length: 36 }).notNull(),
    format: mysqlEnum("format", ["aiken", "gift"]).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }),
    rawContent: longtext("raw_content").notNull(),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"])
      .notNull()
      .default("pending"),
    totalQuestions: int("total_questions").notNull().default(0),
    importedQuestions: int("imported_questions").notNull().default(0),
    errorLog: json("error_log").$type<unknown>(),
    importedBy: char("imported_by", { length: 36 }).notNull(),
    createdAt: datetime("created_at").notNull().default(now()),
    completedAt: datetime("completed_at"),
  },
  (t) => [index("idx_imports_subject").on(t.subjectId)],
);

/**
 * Audit operasi sistem (backup/restore/reset). Sengaja tanpa foreign key agar
 * riwayat tetap tersimpan setelah user atau data lain dihapus.
 */
export const systemEvents = mysqlTable(
  "system_events",
  {
    id: id(),
    actorId: char("actor_id", { length: 36 }),
    actorUsername: varchar("actor_username", { length: 100 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    detail: json("detail").$type<Record<string, unknown>>(),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: datetime("created_at").notNull().default(now()),
  },
  (t) => [index("idx_system_events_created").on(t.createdAt)],
);
