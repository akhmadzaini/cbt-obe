# Database Conventions for CBT

- Semua tabel menggunakan format `snake_case` dan plural.
- Primary key menggunakan UUID.
- Wajib ada tabel `exam_sessions` untuk melacak status ujian peserta (started, in_progress, finished, suspended).
- Wajib membuat tabel `exam_violation_logs` untuk mencatat setiap kali peserta mencoba curang (berisi `session_id`, `violation_type`, `timestamp`, dan `screenshot_url` jika ada).
- Gunakan transaction (ACID) saat menyimpan jawaban peserta untuk mencegah data hilang atau duplikat jika koneksi terputus.
- Soal mendukung format AIKEN dan GIFT