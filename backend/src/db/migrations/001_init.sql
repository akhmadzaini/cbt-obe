-- CBT initial schema (MariaDB 11 / InnoDB / utf8mb4)
-- Semua PK memakai CHAR(36) UUID yang di-generate di aplikasi.

CREATE TABLE IF NOT EXISTS _migrations (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role ENUM('admin','teacher','student') NOT NULL DEFAULT 'student',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subjects_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exams (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subject_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  duration_minutes INT NOT NULL,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  max_strikes INT NOT NULL DEFAULT 3,
  shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_options BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_exams_subject (subject_id),
  KEY idx_exams_status (status),
  CONSTRAINT fk_exams_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_exams_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subject_id CHAR(36) NOT NULL,
  question_type ENUM(
    'multiple_choice','multiple_response','true_false',
    'matching','short_answer','numerical','essay'
  ) NOT NULL DEFAULT 'multiple_choice',
  question_text TEXT NOT NULL,
  image_url VARCHAR(500) NULL,
  points DECIMAL(6,2) NOT NULL DEFAULT 1.00,
  general_feedback TEXT NULL,
  answer_key JSON NULL,
  category VARCHAR(255) NULL,
  source_format ENUM('manual','aiken','gift') NOT NULL DEFAULT 'manual',
  source_ref VARCHAR(255) NULL,
  raw_source TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_questions_subject_category (subject_id, category),
  CONSTRAINT fk_questions_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_options (
  id CHAR(36) NOT NULL PRIMARY KEY,
  question_id CHAR(36) NOT NULL,
  label VARCHAR(10) NOT NULL,
  option_text TEXT NULL,
  image_url VARCHAR(500) NULL,
  fraction DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  feedback TEXT NULL,
  order_index INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_question_options_label (question_id, label),
  CONSTRAINT fk_question_options_question FOREIGN KEY (question_id)
    REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_match_pairs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  question_id CHAR(36) NOT NULL,
  left_text TEXT NOT NULL,
  right_text TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  KEY idx_match_pairs_question (question_id),
  CONSTRAINT fk_match_pairs_question FOREIGN KEY (question_id)
    REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_questions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  exam_id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  order_index INT NOT NULL,
  points_override DECIMAL(6,2) NULL,
  UNIQUE KEY uq_exam_questions_question (exam_id, question_id),
  UNIQUE KEY uq_exam_questions_order (exam_id, order_index),
  CONSTRAINT fk_exam_questions_exam FOREIGN KEY (exam_id)
    REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_questions_question FOREIGN KEY (question_id)
    REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  exam_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('started','in_progress','finished','suspended') NOT NULL DEFAULT 'started',
  started_at DATETIME NOT NULL,
  deadline_at DATETIME NOT NULL,
  paused_at DATETIME NULL,
  accumulated_pause_seconds INT NOT NULL DEFAULT 0,
  finished_at DATETIME NULL,
  finished_reason ENUM('submitted','time_expired','force_submit','suspended') NULL,
  grading_status ENUM('pending','partial','completed') NOT NULL DEFAULT 'pending',
  last_heartbeat_at DATETIME NULL,
  strike_count INT NOT NULL DEFAULT 0,
  score DECIMAL(7,2) NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(512) NOT NULL,
  device_fingerprint VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exam_sessions_exam_user (exam_id, user_id),
  KEY idx_exam_sessions_status (status),
  CONSTRAINT fk_exam_sessions_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT fk_exam_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_answers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  selected_option_id CHAR(36) NULL,
  answer_payload JSON NULL,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  score_awarded DECIMAL(6,2) NULL,
  answered_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_exam_answers_session_question (session_id, question_id),
  KEY idx_exam_answers_session (session_id),
  CONSTRAINT fk_exam_answers_session FOREIGN KEY (session_id)
    REFERENCES exam_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_answers_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_exam_answers_option FOREIGN KEY (selected_option_id)
    REFERENCES question_options(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_violation_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  violation_type ENUM(
    'tab_hidden','window_blur','fullscreen_exit',
    'dom_injection','contextmenu','copy_paste','keyboard_shortcut'
  ) NOT NULL,
  strike_number INT NOT NULL,
  screenshot_url VARCHAR(500) NULL,
  metadata JSON NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_violation_session_time (session_id, `timestamp`),
  CONSTRAINT fk_violation_session FOREIGN KEY (session_id)
    REFERENCES exam_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_imports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subject_id CHAR(36) NOT NULL,
  format ENUM('aiken','gift') NOT NULL,
  original_filename VARCHAR(255) NULL,
  raw_content LONGTEXT NOT NULL,
  status ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  total_questions INT NOT NULL DEFAULT 0,
  imported_questions INT NOT NULL DEFAULT 0,
  error_log JSON NULL,
  imported_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  KEY idx_imports_subject (subject_id),
  CONSTRAINT fk_imports_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_imports_user FOREIGN KEY (imported_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
