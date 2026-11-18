-- Kepemilikan bank soal & indeks pembuat ujian.
-- `questions.created_by` NULL = bank soal bersama (data lama / buatan admin).

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS created_by CHAR(36) NULL AFTER raw_source;

CREATE INDEX IF NOT EXISTS idx_questions_created_by
  ON questions (created_by);

CREATE INDEX IF NOT EXISTS idx_exams_created_by
  ON exams (created_by);

SET @fk_questions_creator_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'questions'
    AND CONSTRAINT_NAME = 'fk_questions_creator'
);

SET @fk_questions_creator_sql := IF(
  @fk_questions_creator_exists = 0,
  'ALTER TABLE questions ADD CONSTRAINT fk_questions_creator FOREIGN KEY (created_by) REFERENCES users(id)',
  'SELECT 1'
);

PREPARE fk_questions_creator_stmt FROM @fk_questions_creator_sql;
EXECUTE fk_questions_creator_stmt;
DEALLOCATE PREPARE fk_questions_creator_stmt;
