---
name: CBT Project
description: Konvensi dan alur kerja proyek CBT (Bun/ElysiaJS + Drizzle + MariaDB, React/Vite/Tailwind). Gunakan saat mengubah backend, frontend, parser soal AIKEN/GIFT, sesi ujian, anti-cheat, penilaian, impor peserta, atau deployment Docker.
---

# CBT Project — Panduan Kerja

Aplikasi ujian berbasis komputer. Backend ElysiaJS di Bun, database MariaDB
lewat Drizzle ORM, frontend React + Vite + Tailwind, sepenuhnya Docker dan
disajikan melalui Nginx. Tidak boleh memakai cloud storage pihak ketiga.

## Peta kode

- `backend/src/index.ts` — bootstrap, migrasi, seed, static `/uploads`.
- `backend/src/routes/` — `auth`, `subjects`, `questions`, `exams`, `imports`,
  `sessions`, `grading`, `results`, `users`.
- `backend/src/lib/` — `auth` (JWT + fingerprint), `scoring`, `session-service`,
  `questions`, `files`, `parsers/{aiken,gift}`, `rate-limit`, `backup`,
  `system-jobs`, `system-reset`, `maintenance`, `audit`.
- `backend/src/db/` — `schema.ts`, `migrate.ts`, `migrations/*.sql`.
- `frontend/src/pages/` — `Login`, `ExamList`, `ExamRunner`, `Admin`.
- `frontend/src/components/QuestionCard.tsx` — render semua tipe soal.
- `frontend/src/components/AdminNav.tsx` — navigasi admin (grup Ujian berupa dropdown).
- `frontend/src/components/ExamParticipantsModal.tsx` — kelola peserta per ujian.
- `frontend/src/components/ParticipantPicker.tsx` — pemilih peserta dengan pencarian.
- `frontend/src/components/QuestionEditorModal.tsx` — form tambah/edit soal manual.
- `frontend/src/components/QuestionDeleteDialog.tsx` — konfirmasi hapus + info integritas.
- `frontend/src/components/ParticipantEditorModal.tsx` — form tambah/edit peserta.
- `frontend/src/components/ParticipantDeleteDialog.tsx` — konfirmasi hapus peserta.
- `frontend/src/lib/` — `api`, `auth`, `anticheat`, `types`.
- `data/uploads/` — bind mount gambar soal & screenshot pelanggaran.
- `samples/` — contoh AIKEN/GIFT.

## Verifikasi wajib sebelum selesai

Jalankan dari folder masing-masing:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

Tidak ada unit test. `backend/smoke-users.mjs` adalah smoke test end-to-end yang
mengubah database (membuat user `uji001`, memulai sesi) dan menargetkan
`http://localhost:8080`; jangan jalankan tanpa stack hidup dan DB yang boleh
diubah.

## Konvensi backend

- Elysia route per domain, prefix `/api/<domain>`, plugin `jwtPlugin`.
- Autentikasi: `authenticate({ headers, request, server, jwt })`; otorisasi:
  `requireRole(user, [...])`. Jangan menambah endpoint tanpa keduanya kecuali
  endpoint publik yang disengaja. `authenticate()` juga memeriksa akun masih
  ada dan `is_active`, sehingga penonaktifan pengguna langsung mencabut token
  lama.
- Semua PK `CHAR(36)` UUID yang dibuat di aplikasi (`randomUUID()`), bukan
  auto-increment.
- Jawaban peserta wajib memakai transaksi + `SELECT ... FOR UPDATE` dan
  `INSERT ... ON DUPLICATE KEY UPDATE` seperti di `routes/sessions.ts`.
- Skor dihitung di `lib/scoring.ts`; finalisasi sesi hanya lewat
  `finalizeSession(tx, sessionId, reason)` agar status, skor, dan
  `grading_status` konsisten.
- Timer bersifat server-authoritative (`deadline_at`). Jeda menambah
  `deadline_at` saat resume, bukan menghitung ulang durasi.
- Upload file hanya lewat `lib/files.ts` (png/jpg/jpeg/webp) ke
  `data/uploads`; jangan menambah S3/GCS.
- Migrasi SQL harus idempoten dan diberi nama berurutan di
  `src/db/migrations/`; jangan mengubah migrasi yang sudah pernah diterapkan.
- Password memakai `Bun.password.hash/verify`. Jangan pernah mencatat token,
  password, isi `.env`, atau data pribadi peserta ke log.

## Bank soal manual & integritas

- Endpoint soal: `POST /api/questions` (manual), `PATCH /api/questions/:id`,
  `DELETE /api/questions/:id`, dan `GET /api/questions/:id/usage`.
- Soal terkunci untuk edit/hapus jika sudah memiliki sesi ujian, sudah memiliki
  jawaban, atau terpasang pada ujian `archived`.
- Soal yang hanya terpasang pada ujian `draft`/`published` **tanpa sesi** masih
  boleh disunting. Saat dihapus, baris `exam_questions` dilepas otomatis dan
  ujian tetap ada.
- Opsi/pasangan diperbarui in-place berdasarkan ID agar
  `exam_answers.selected_option_id`, riwayat jawaban, dan gambar opsi tidak
  rusak. Label opsi diregenerasi server-side (`A`, `B`, … / `TRUE`, `FALSE`).
- Jangan menghapus opsi/pasangan yang sudah memiliki jawaban. Selalu panggil
  `getQuestionUsage()` di dalam transaksi sebelum menulis/menghapus.
- Setelah soal dihapus, folder `data/uploads/questions/<questionId>`
  dibersihkan best-effort lewat `removeQuestionUploads()`.
- `sourceFormat`, `sourceRef`, dan `rawSource` dipertahankan saat edit.

## Peran guru & kepemilikan data

- Tiga peran: `admin`, `teacher`, `student`. Admin melihat semua data; guru
  hanya data miliknya (`exams.created_by`, `questions.created_by`).
- `questions.created_by = NULL` berarti **bank soal bersama** (data lama atau
  buatan admin). Semua guru boleh melihat dan memakainya di ujian, tetapi hanya
  admin yang boleh mengubah/menghapus.
- Semua endpoint baca/tulis wajib memakai helper di `lib/access.ts`
  (`examScopeCondition`, `questionScopeCondition`, `findExamForUser`,
  `filterVisibleQuestionIds`, `canManageQuestion`, `canViewQuestion`). Jangan
  menambah query baru tanpa filter kepemilikan; akses lintas guru harus 404
  (bukan 403) agar keberadaan data tidak bocor.
- Pemasangan soal ke ujian wajib menyaring `filterVisibleQuestionIds()`; guru
  tidak boleh memakai soal privat guru lain.
- Hasil, detail hasil, ekspor Excel, dan penilaian essay wajib dibatasi ke ujian
  milik guru. Reset sesi, pembatalan submission, panel Sistem, dan pembuatan
  akun guru tetap khusus admin.
- Mapel bersifat global dan hanya admin yang boleh membuatnya (`POST
  /api/subjects`). Akun siswa tetap global; guru boleh membuat/mengelola akun
  siswa dan memilih peserta untuk ujiannya sendiri.
- Frontend admin menampilkan tab **Guru** (khusus admin) dengan
  `TeacherTab.tsx`; soal bank bersama ditandai `canManage = false` sehingga
  tombol edit/hapus/upload disembunyikan.

## Manajemen peserta manual

- Endpoint: `GET /api/users?role=student`, `POST /api/users`,
  `PATCH /api/users/:id`, `DELETE /api/users/:id`, dan
  `GET /api/users/:id/usage`.
- `POST /api/users` menerima `role` opsional `student|teacher`; hanya admin yang
  boleh membuat `teacher`. Akun admin tidak boleh diubah/dihapus lewat endpoint
  ini. Akun guru tidak boleh dihapus (nonaktifkan lewat `isActive`).
- Create: username unik (case-insensitive), 3-100 karakter, pola
  `[A-Za-z0-9._-]+`; nama 1-150; password 8-128; `isActive` default `true`.
- Edit: username boleh diubah dengan cek unik; password opsional (kosong =
  tidak diubah); nonaktifkan akun lewat `isActive`.
- Hapus peserta diblokir jika sudah memiliki `exam_sessions`. Arahkan admin
  untuk menonaktifkan akun. Jangan menghapus sesi/jawaban peserta.
- Frontend memakai `ParticipantEditorModal` dan `ParticipantDeleteDialog`;
  akun guru memakai `TeacherTab.tsx`.

## Peserta per ujian

- Tabel `exam_participants` menyimpan assignment `(exam_id, user_id)`.
- Siswa hanya melihat dan memulai ujian yang di-assign; `sessions/start`
  menolak sesi baru tanpa assignment (sesi lama tetap boleh resume).
- Endpoint admin: `GET/PUT /api/exams/:id/participants`; `POST /api/exams`
  menerima `participantIds`.
- Peserta yang sudah memiliki sesi ujian tidak boleh dilepas; ujian `archived`
  bersifat read-only untuk assignment.
- Migrasi `002_exam_participants.sql` membackfill semua user yang punya sesi
  dan semua siswa aktif ke ujian `published` yang sudah ada. Ujian baru mulai
  tanpa peserta.
- Frontend memakai `ParticipantPicker` dan `ExamParticipantsModal`. Jika ujian
  belum punya peserta, tampilkan peringatan bahwa ujian tidak akan muncul bagi
  siswa.

## Pembatalan ujian

- Ujian hanya boleh dibatalkan jika **belum memiliki satu pun `exam_sessions`**
  (status apa pun, termasuk sesi yang belum selesai). Jika sudah ada sesi,
  arahkan admin untuk mengarsipkan ujian.
- Endpoint: `GET /api/exams/:id/usage` (pratinjau jumlah soal, peserta, sesi)
  dan `DELETE /api/exams/:id` (transaksi + lock baris ujian, lalu hapus).
- Penghapusan ujian memakai cascade `exam_questions` dan `exam_participants`.
  Soal di bank soal tidak ikut terhapus. Jangan menambah penghapusan sesi atau
  jawaban peserta untuk memaksa pembatalan.
- Frontend memakai `ExamCancelDialog`; tombol **Batalkan** ada di daftar ujian
  dan dialog harus menjelaskan bahwa tindakan ini permanen.

## Ekspor nilai Excel

- Endpoint: `GET /api/results/export?examId=<id>&mode=summary|category`
  (admin & guru) di `routes/results.ts`, dibangun oleh
  `lib/results-export.ts` memakai `ExcelJS`.
- Hanya sesi `finished` yang diekspor. `summary` menghasilkan kolom
  NIM (username), nama, skor, total skor; `category` menambah kolom kategori
  soal dan mengagregasi `exam_answers.score_awarded` per kategori.
- Total skor memakai `exam_questions.points_override ?? questions.points`.
  Kategori kosong dilabeli "Tanpa kategori"; essay yang belum dinilai dihitung
  0 sampai dinilai manual.
- Jangan menambahkan kolom NIM terpisah tanpa migrasi `users`; saat ini NIM
  mengikuti `username`.

## Model data inti

Tabel utama: `users`, `subjects`, `exams`, `questions`, `question_options`,
`question_match_pairs`, `exam_questions`, `exam_participants`, `exam_sessions`,
`exam_answers`, `exam_violation_logs`, `question_imports`.

- Satu sesi per `(exam_id, user_id)`.
- Status sesi: `started`, `in_progress`, `finished`, `suspended`.
- `finished_reason`: `submitted`, `time_expired`, `force_submit`, `suspended`.
- `grading_status`: `pending`, `partial` (ada essay belum dinilai), `completed`.
- Opsi benar/salah memakai `question_options.fraction` (0..1). Soal non-opsi
  memakai `questions.answer_key` JSON.
- `exams.created_by` wajib terisi; `questions.created_by` nullable dengan
  `NULL` = bank soal bersama. Migrasi `004_teacher_ownership.sql` menambahkan
  kolom/index/FK tersebut dan idempoten.

## Bentuk payload jawaban

Konsistenkan dengan `frontend/src/lib/types.ts` dan `lib/scoring.ts`:

- `multiple_choice` / `true_false` → `selectedOptionId`.
- `multiple_response` → `answerPayload.option_ids: string[]`.
- `matching` → `answerPayload.mapping: { [leftPairId]: rightPairId }`.
- `short_answer` / `essay` → `answerPayload.text: string`.
- `numerical` → `answerPayload.value: number`.

Jangan memakai `value` untuk jawaban teks; frontend menyimpan `{ text }` dan
`grading.ts` membacanya sebagai `text`. Jika menampilkan jawaban di admin,
gunakan helper yang membaca `text` (fallback `value` untuk data lama).

## Parser AIKEN & GIFT

- AIKEN: satu jawaban benar per blok, `ANSWER: X`; hanya `multiple_choice`.
- GIFT mendukung: multiple choice, multiple response, true/false, matching,
  short answer, numerical, essay, partial credit (`~%50%`), feedback opsi
  (`#...`), general feedback (`####...`), title (`::...::`), `$CATEGORY:`.
- Cloze/embedded answer **tidak** didukung.
- Heuristik GIFT: `=` tunggal → pilihan tunggal; tanpa `=` atau lebih dari satu
  `=` → multiple response. Jangan mengubah tanpa memperbarui contoh di
  `samples/` dan menjelaskan dampaknya ke penilaian.
- Setiap soal hasil parsing disimpan lewat `insertParsedQuestion()` dalam satu
  transaksi.

## Konvensi frontend

- Semua HTTP lewat `api()` / `apiForm()` / `apiDownload()` di `lib/api.ts`
  (token Bearer, penanganan 401, `no-store`). Jangan memanggil `fetch` langsung
  kecuali untuk kasus khusus.
- Jawaban disimpan optimistis ke state + `localStorage`
  (`cbt_exam_<examId>`, `cbt_pending_<sessionId>`), lalu dikirim ke server.
- Saat mengubah `ExamRunner`:
  - Flush teks yang masih menunggu debounce dan antrean offline **sebelum**
    submit, reconnect, atau resume.
  - Jangan mengirim ulang jawaban setelah sesi selesai.
  - Jaga agar timer, strike, dan overlay tetap sinkron dengan server.
- Render teks soal dengan `DOMPurify` (sudah ada di `QuestionCard`). Jangan
  memakai `dangerouslySetInnerHTML` tanpa sanitasi.
- UI harus responsif mobile & desktop; pertahankan kelas Tailwind yang ada.

## Anti-cheat — jangan dilanggar

- Wajib fullscreen untuk memulai/melanjutkan ujian.
- Deteksi `visibilitychange`, `blur`, `fullscreenchange`; overlay peringatan
  dirender ke `#modal-root` (bukan `#root`).
- `MutationObserver` hanya memantau **direct children `<body>`** dengan
  `subtree: false`, dan mengabaikan `#root` serta `#modal-root`.
- Saat fullscreen, `installInteractionGuards` memanggil `preventDefault()` untuk
  Escape dan `enterFullscreen()` memasang Keyboard Lock API (best-effort,
  Chromium + secure context). Jangan menghapus fallback `fullscreenchange`;
  browser non-Chromium/HTTP tetap bisa keluar dan harus tercatat sebagai
  `fullscreen_exit`. Unlock keyboard saat submit, force submit, atau keluar
  fullscreen.
- Pelanggaran berat (`tab_hidden`, `window_blur`, `fullscreen_exit`,
  `dom_injection`) menambah strike + menjeda timer + screenshot.
  `contextmenu`, `copy_paste`, `keyboard_shortcut` hanya dicatat, bukan strike.
- Melebihi `maxStrikes` → `force_submit` + logout paksa. Jangan menambah
  escape hatch tanpa persetujuan.
- Pemulihan sesi `force_submit` hanya lewat `POST /api/results/:sessionId/reset`
  (khusus `admin`). Reset mempertahankan jawaban, mengosongkan
  `score_awarded`, mengembalikan strike ke 0, membuka sesi menjadi
  `in_progress`, dan mengembalikan waktu yang hilang selama sesi terhenti.
  Jangan mengizinkan peserta mereset sendiri atau memperluas reset ke sesi
  `submitted`/`time_expired` tanpa persetujuan.
- Screenshot memakai `html2canvas` pada `#root`; sementara capture berjalan,
  mutation guard diabaikan agar iframe html2canvas tidak dianggap injeksi.

## Rate limit & DoS

- Login: `checkLoginRateLimit()` sebelum query DB dan verifikasi password; key
  per IP dan per username. Gunakan `applyRateLimitHeaders()` + status 429.
- Endpoint berat memakai `RATE_LIMITS` di `lib/rate-limit.ts` (import soal,
  import peserta, upload gambar, start/violations/answers/heartbeat/submit).
- Rate limit aplikasi in-memory dan dibatasi jumlah key; cocok untuk satu
  instance. Multi-instance memerlukan Redis/penyimpanan bersama.
- Nginx membatasi login, `/api/`, `/uploads/`, dan koneksi per IP. `real_ip`
  hanya mempercayai proxy privat; backend memprioritaskan `X-Real-IP`.
- Untuk DDoS volumetrik tetap gunakan proteksi edge (Cloudflare/WAF/firewall).
  Jangan mengandalkan rate limit aplikasi saja.

## Backup, restore & factory reset

- Endpoint ada di `routes/system.ts`, prefix `/api/system`, **hanya admin**
  (`requireRole(user, ["admin"])`), dan semua operasi destruktif wajib password
  ulang.
- Backup/restore berjalan sebagai job latar (`lib/system-jobs.ts`); hanya satu
  job pada satu waktu. Progres di-poll dari `GET /api/system/jobs/:id`.
- Arsip `.tar.gz` berisi `database.sql`, `uploads/`, dan `manifest.json`.
  Dump memakai `mariadb-dump --single-transaction`; arsip dibuat dengan binary
  `tar` (sudah diinstal di image backend).
- Sebelum restore: validasi manifest + checksum, tolak arsip dengan migrasi
  yang belum dikenal, lalu buat safety backup otomatis.
- Restore memakai mode pemeliharaan (`lib/maintenance.ts`); endpoint tulis
  mengembalikan 503. Setelah restore sukses backend `process.exit(0)` dan
  dijalankan ulang oleh Docker.
- Factory reset mempertahankan skema, `_migrations`, audit `system_events`, dan
  akun admin yang sedang login. Jangan menambahkan seed otomatis.
- Jangan menyimpan arsip di `data/uploads` (tersaji publik). Arsip ada di
  `data/backups` (bind mount, tidak di-backup oleh dirinya sendiri).
- `.env` tidak ikut backup; dokumentasikan backup manual untuk secret.
- Nginx punya `location = /api/system/restore` dengan body limit besar dan
  `proxy_request_buffering off`; jangan menaikkan limit global.

## Deployment & operasional

- `docker compose up -d --build`; frontend satu-satunya service yang
  mengekspos port (`APP_PORT`, default 8080).
- `frontend/nginx.conf` mem-proxy `/api` dan `/uploads` ke backend serta
  menangani fallback SPA.
- `.env` berisi kredensial; jangan pernah menampilkan isinya. `.env.example`
  adalah referensi variabel.
- Seed demo hanya berjalan saat tabel `users` kosong. Jangan mengandalkan seed
  untuk data produksi.

## Jebakan yang sudah pernah diperbaiki — jangan regresi

1. Jawaban teks disimpan sebagai `{ text }`, bukan `{ value }`.
2. Antrean offline (`cbt_pending_*`) dan debounce teks harus di-flush sebelum
   submit.
3. Pengacakan soal/opsi harus deterministik per `session.id` agar tidak berubah
   saat resume/reload (`shuffle()` di `session-service.ts`).
4. Opsi matching diacak dengan seed per sesi; jawaban tetap dipetakan lewat ID
   pasangan.
5. Finalisasi otomatis sesi hanya lewat `finalizeSession`; penilaian essay manual
   menghitung ulang skor di `routes/grading.ts` dalam satu transaksi.
6. Edit/hapus soal wajib memakai `getQuestionUsage()`; jangan mengandalkan
   foreign key saja dan jangan hapus opsi yang masih dirujuk jawaban peserta.
7. Hapus peserta wajib mengecek `exam_sessions`; gunakan nonaktifkan akun
   (`is_active`) sebagai ganti penghapusan jika peserta sudah punya sesi.
8. Assignment peserta ujian wajib dicek di daftar ujian siswa dan
   `sessions/start`; jangan melepas peserta yang sudah memiliki sesi.
9. Rate limit login harus dicek sebelum query DB/verifikasi password; endpoint
   autosave/heartbeat memakai limit longgar agar ujian tidak terblokir.
10. Backup/restore/reset wajib membuat safety backup lebih dulu dan tidak boleh
    berjalan bersamaan. Restore tidak boleh menimpa arsip yang dibuat versi
    aplikasi lebih baru.
