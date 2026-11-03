-- Audit operasi sistem (backup, restore, factory reset).
-- Tidak memakai foreign key agar riwayat tetap ada setelah user dihapus.
CREATE TABLE IF NOT EXISTS system_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  actor_id CHAR(36) NULL,
  actor_username VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  detail JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
