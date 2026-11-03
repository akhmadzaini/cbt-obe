-- Peserta per ujian: hanya peserta yang di-assign yang boleh melihat/memulai ujian.
-- Backfill menjaga akses ujian lama tetap berjalan.

CREATE TABLE IF NOT EXISTS exam_participants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  exam_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exam_participants_exam_user (exam_id, user_id),
  KEY idx_exam_participants_user (user_id),
  CONSTRAINT fk_exam_participants_exam FOREIGN KEY (exam_id)
    REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_participants_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_participants_assigner FOREIGN KEY (assigned_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. Pertahankan akses siapa pun yang sudah memiliki sesi ujian.
INSERT IGNORE INTO exam_participants (id, exam_id, user_id, assigned_at)
SELECT UUID(), s.exam_id, s.user_id, NOW()
FROM exam_sessions s;

-- 2. Ujian published yang sudah ada tetap terlihat oleh semua siswa aktif,
--    sehingga perilaku lama tidak berubah setelah migrasi.
INSERT IGNORE INTO exam_participants (id, exam_id, user_id, assigned_at)
SELECT UUID(), e.id, u.id, NOW()
FROM exams e
JOIN users u ON u.role = 'student' AND u.is_active = TRUE
WHERE e.status = 'published';
