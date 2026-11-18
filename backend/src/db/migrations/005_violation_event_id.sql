-- Deduplikasi pelanggaran: request normal dan fallback keepalive dapat
-- mengirim kejadian yang sama saat tab ditutup. NULL tetap boleh berulang.

ALTER TABLE exam_violation_logs
  ADD COLUMN IF NOT EXISTS client_event_id VARCHAR(64) NULL AFTER session_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_violation_session_event
  ON exam_violation_logs (session_id, client_event_id);
