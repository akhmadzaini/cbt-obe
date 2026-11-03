# CBT — Computer Based Test

Sistem ujian berbasis komputer dengan backend **ElysiaJS (Bun)**, frontend **React + Tailwind**, dan database **MariaDB**. Dirancang untuk berjalan penuh di Docker di VPS Linux di belakang **Nginx Proxy Manager**, tanpa layanan cloud storage pihak ketiga.

## Fitur utama

- Login JWT yang diikat ke **User-Agent** (opsional juga IP) untuk mencegah login dua perangkat.
- Rate limit login per IP/username serta endpoint berat (import, upload, mulai ujian, autosave, heartbeat), ditambah limit Nginx.
- Backup, restore, dan factory reset dari panel admin. Arsip `.tar.gz` berisi
  dump database + file upload, dengan safety backup otomatis dan audit log.
- Bank soal mendukung **AIKEN** dan **GIFT** (import), termasuk:
  - pilihan ganda, multiple response, benar/salah
  - matching, short answer, numerical, essay
  - partial credit (`~%50%`), feedback per opsi, general feedback, `$CATEGORY:`
- Pengelolaan soal manual: tambah, edit, dan hapus dengan pemeriksaan integritas
  (soal yang sudah dipakai sesi ujian tidak dapat diubah/dihapus).
- Manajemen peserta manual: tambah, edit, dan hapus akun peserta selain import
  Excel. Peserta yang sudah memiliki sesi ujian tidak dapat dihapus dan dapat
  dinonaktifkan melalui edit.
- Peserta per ujian: setiap ujian memiliki daftar peserta sendiri. Hanya peserta
  yang di-assign yang melihat dan dapat memulai ujian. Assignment dapat diatur
  saat membuat ujian maupun setelahnya.
- Pembatalan ujian: ujian yang belum pernah memiliki sesi peserta dapat
  dibatalkan permanen dari daftar ujian. Ujian yang sudah pernah dikerjakan
  harus diarsipkan agar riwayat peserta tetap aman.
- Gambar soal (jpg/png/webp) diunggah ke penyimpanan lokal (`data/uploads`) melalui panel admin.
- Penilaian essay manual melalui tab **Nilai Essay** (skor otomatis tetap dihitung untuk soal non-essay).
- Ekspor nilai ke Excel dari tab **Skor**: ringkasan per peserta (NIM/username, nama, skor, total skor) atau rincian per kategori soal. Hanya sesi selesai yang diekspor; essay yang belum dinilai dihitung 0 sampai dinilai manual.
- Ujian dengan timer **server-authoritative** (`deadline_at`), auto-save jawaban, dan resume sesi.
- Anti-cheat:
  - wajib fullscreen
  - deteksi `visibilitychange`, `blur`, `fullscreenchange`
  - overlay peringatan + timer dijeda + strike + log async
  - maksimal 3 strike (dapat dikonfigurasi per ujian); melebihi batas = force submit + logout
  - blokir klik kanan, seleksi teks, copy/cut/paste, shortcut keyboard
  - blokir Escape saat fullscreen di Chromium (Keyboard Lock API) agar keluar
    harus menahan Escape ±2 detik; browser lain tetap terdeteksi sebagai
    `fullscreen_exit`
  - `MutationObserver` hanya memantau **direct children `<body>`**, whitelist `#root` dan `#modal-root`
  - screenshot pelanggaran via `html2canvas`, disimpan lokal
- Reconnect: tampilan “Koneksi terputus”, timer dibekukan, antrean jawaban di `localStorage`, lalu sinkronisasi ulang.
- Jawaban disimpan dengan transaksi ACID (`SELECT ... FOR UPDATE` + `INSERT ... ON DUPLICATE KEY UPDATE`).

## Struktur proyek

```
cbt/
├─ docker-compose.yml
├─ .env.example
├─ data/uploads/            # bind mount file gambar & screenshot (lokal)
├─ data/backups/            # arsip backup sistem (.tar.gz)
├─ samples/                 # contoh file AIKEN & GIFT
├─ backend/                 # ElysiaJS + Drizzle ORM
│  ├─ Dockerfile
│  └─ src/
│     ├─ db/                # schema, koneksi, migrasi SQL
│     ├─ lib/               # auth, scoring, parser, session service
│     └─ routes/            # auth, exams, questions, imports, sessions, grading
└─ frontend/                # React + Vite + Tailwind
   ├─ Dockerfile
   ├─ nginx.conf
   └─ src/
      ├─ components/
      ├─ lib/               # api, auth, anti-cheat
      └─ pages/             # Login, ExamList, ExamRunner, Admin
```

## Menjalankan

1. Salin environment:

   ```bash
   cp .env.example .env
   ```

2. **Wajib** ganti `JWT_SECRET`, `DB_PASSWORD`, dan `DB_ROOT_PASSWORD` dengan nilai acak yang kuat.

3. Jalankan:

   ```bash
   docker compose up -d --build
   ```

4. Buka `http://localhost:8080` (atau `APP_PORT` yang dipilih).

Saat pertama kali dijalankan, backend otomatis:
- menjalankan migrasi SQL (`backend/src/db/migrations/*.sql`),
- melakukan seed data demo (jika `SEED_ON_START=true`).

### Akun demo

| Role  | Username | Password    |
|-------|----------|-------------|
| Admin | `admin`  | `admin12345` |
| Siswa | `siswa`  | `siswa12345` |

Ubah kredensial seed melalui variabel `SEED_*` sebelum pertama kali start, atau ganti langsung di database.

## Environment

| Variabel | Keterangan |
|---|---|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` | Kredensial MariaDB |
| `APP_PORT` | Port publik frontend (default `8080`) |
| `JWT_SECRET` | Secret JWT, minimal 32 karakter |
| `BIND_IP` | `true` untuk mengikat token juga ke IP (default `false`) |
| `RATE_LIMIT_ENABLED` | Aktifkan rate limit aplikasi (default `true`) |
| `LOGIN_IP_LIMIT` | Maks. percobaan login per IP per window (default `300`) |
| `LOGIN_USER_LIMIT` | Maks. percobaan login per username per window (default `5`) |
| `LOGIN_WINDOW_SECONDS` | Panjang window rate limit login (default `300`) |
| `BACKUP_ENABLED` | Aktifkan fitur backup/restore (default `true`) |
| `BACKUP_RETENTION_COUNT` | Jumlah arsip backup yang disimpan otomatis (default `10`) |
| `BACKUP_MAX_UPLOAD_MB` | Ukuran maksimal arsip restore yang diunggah (default `1024`) |
| `TRUST_PROXY` | Percayai `X-Forwarded-For` dari reverse proxy (default `true`) |
| `SEED_ON_START` | Seed data demo saat DB kosong |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | Akun admin awal |
| `SEED_STUDENT_USERNAME`, `SEED_STUDENT_PASSWORD` | Akun siswa awal |
| `PUBLIC_BASE_URL` | Opsional, untuk referensi URL absolut |

### Rate limit

- Backend membatasi login per IP dan per username, serta endpoint berat
  (import, upload gambar, mulai ujian, pelanggaran, autosave, heartbeat, submit).
- Nginx membatasi request login, request `/api/`, dan jumlah koneksi per IP.
  `set_real_ip_from` saat ini mempercayai jaringan privat; jika Nginx Proxy
  Manager berada di IP publik, tambahkan `set_real_ip_from <IP-NPM>;`.
- Rate limit aplikasi disimpan in-memory; cocok untuk satu instance backend.
  Untuk multi-instance, gunakan Redis atau penyimpanan bersama.
- Untuk DDoS volumetrik, tetap gunakan proteksi edge seperti Cloudflare/WAF,
  firewall VPS, atau `fail2ban`.

## Backup, restore & factory reset

Semua operasi ada di panel admin → tab **Sistem** (khusus role `admin`).

### Backup

- Membuat arsip `data/backups/cbt-backup-YYYYMMDD-HHmmss-manual.tar.gz`
  berisi `database.sql`, `uploads/`, dan `manifest.json` (versi, daftar
  migrasi, jumlah baris, checksum).
- Backup berjalan sebagai job latar; panel menampilkan progres.
- Arsip bisa diunduh lewat tombol **Unduh**. Simpan salinan di luar server
  (rsync/rclone/object storage) — backup di disk yang sama bukan backup sejati.
- Retensi otomatis menyimpan `BACKUP_RETENTION_COUNT` arsip terbaru.
- `.env` **tidak** disertakan. Simpan `.env` (JWT secret & kredensial DB)
  secara terpisah.

### Restore

- Pilih arsip di daftar (**Restore**) atau unggah file `.tar.gz` (**Restore
  dari File**), lalu masukkan password admin.
- Cakupan: `Database + file upload`, `Database saja`, atau `File upload saja`.
- Sistem otomatis:
  1. membuat **safety backup**,
  2. masuk mode pemeliharaan (endpoint tulis mengembalikan 503),
  3. memvalidasi manifest + checksum dan menolak arsip dari versi aplikasi
     yang lebih baru,
  4. memulihkan database/upload,
  5. restart backend; pengguna diarahkan login ulang.
- Jika restore gagal, sistem keluar dari mode pemeliharaan dan menampilkan
  error. Gunakan safety backup untuk kembali ke kondisi sebelumnya.

### Factory reset

- Menghapus **seluruh data** (ujian, soal, peserta, hasil, upload) dan semua
  akun kecuali admin yang sedang login.
- Skema tabel, riwayat migrasi, dan audit `system_events` dipertahankan.
- Wajib: safety backup otomatis, password admin, teks konfirmasi
  `RESET-SISTEM`, dan centang pernyataan.
- Tidak menjalankan seed otomatis. Setelah reset, admin membuat mapel dan
  peserta dari awal.

### Disaster recovery manual

Jika backend tidak bisa start, arsip masih bisa dipulihkan dari host:

```bash
# 1. Ekstrak arsip
mkdir -p restore && tar -xzf data/backups/cbt-backup-....tar.gz -C restore

# 2. Pulihkan database
docker compose exec -T db sh -c \
  'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  < restore/database.sql

# 3. Pulihkan upload
rm -rf data/uploads/* && cp -a restore/uploads/. data/uploads/

# 4. Nyalakan ulang
docker compose up -d
```

Catatan: backup aplikasi mengasumsikan satu instance backend. Untuk
multi-instance, job backup harus dikunci bersama (Redis/DB) dan dump dijalankan
dari satu node saja.

## Format soal

### AIKEN

```
Ibu kota Indonesia adalah?
A. Bandung
B. Jakarta
C. Surabaya
D. Medan
ANSWER: B
```

Satu jawaban benar per blok. Blok dipisahkan baris kosong.

### GIFT

Contoh lengkap tersedia di `samples/gift-sample.txt` dan `samples/gift-partial-sample.txt`.

```gift
$CATEGORY: Matematika/Aljabar

::Persamaan linear::
Nilai x dari 2x + 4 = 10 adalah ... {=3 ~2 ~4 ~5}

::Partial credit::
Ibu kota Indonesia adalah? {=Jakarta ~%50%Bandung ~Surabaya ~Medan}

::Benar atau salah::
Bumi berbentuk bulat. {TRUE}

::Matching::
Pasangkan planet dengan urutannya. {=Merkurius -> 1 =Venus -> 2 =Bumi -> 3}

::Isian singkat::
Ibu kota Jepang adalah ... {=Tokyo}

::Numerik::
Akar kuadrat dari 144 adalah ... {#12:0.01}

::Essay::
Jelaskan proses fotosintesis. {}
```

Yang didukung: multiple choice, multiple response, true/false, matching, short answer, numerical, essay, feedback per opsi (`#...`), general feedback (`####...`), title (`::judul::`), dan `$CATEGORY:`. **Cloze/embedded answer belum didukung.**

## Alur anti-cheat

1. Peserta menekan **Mulai Ujian** → browser masuk fullscreen → `POST /api/sessions/start`.
2. Timer berjalan dari `deadline_at` server.
3. Pelanggaran berat (`tab_hidden`, `window_blur`, `fullscreen_exit`, `dom_injection`):
   - overlay muncul, timer lokal & server dijeda,
   - screenshot `#root` dikirim ke backend,
   - strike bertambah.
4. Peserta menekan **Aktifkan Layar Penuh & Lanjutkan** → `POST /api/sessions/:id/resume` memperpanjang `deadline_at` sesuai durasi jeda.
5. Jika strike melebihi batas → backend menghitung skor, menutup sesi (`force_submit`), frontend logout.
6. Klik kanan / copy-paste / shortcut tetap diblokir dan **dicatat** sebagai log, tetapi tidak menambah strike.
7. Peserta yang terlanjur terhenti paksa dapat meminta **admin** melakukan reset sesi dari tab **Skor → Reset**. Reset hanya berlaku untuk sesi `force_submit`, mempertahankan jawaban, mengembalikan strike ke 0, dan membuka kembali sesi sehingga peserta dapat melanjutkan ujian. Waktu selama sesi terhenti dikembalikan, dan timer tetap dijeda sampai peserta masuk mode layar penuh lagi.

## API ringkas

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | Login, mengembalikan JWT |
| GET | `/api/auth/me` | Profil pengguna aktif |
| GET/POST | `/api/subjects` | Daftar / buat mapel |
| GET | `/api/exams` | Daftar ujian (siswa: published & di-assign) |
| POST | `/api/exams` | Buat ujian (admin/guru), termasuk `participantIds` |
| PATCH | `/api/exams/:id/status` | Publikasi/arsip |
| GET | `/api/exams/:id/usage` | Cek sesi peserta sebelum pembatalan ujian |
| DELETE | `/api/exams/:id` | Batalkan ujian yang belum pernah dikerjakan |
| GET | `/api/exams/:id/participants` | Daftar peserta ujian + status assignment |
| PUT | `/api/exams/:id/participants` | Ganti daftar peserta ujian |
| POST | `/api/exams/:id/questions` | Lampirkan soal ke ujian |
| GET | `/api/questions?subjectId=` | Bank soal (admin/guru) |
| POST | `/api/questions` | Tambah soal manual |
| PATCH | `/api/questions/:id` | Edit soal manual |
| DELETE | `/api/questions/:id` | Hapus soal (cek integritas) |
| GET | `/api/questions/:id/usage` | Cek pemakaian soal di ujian |
| POST | `/api/questions/:id/image` | Upload gambar soal (multipart) |
| GET | `/api/users?role=student` | Daftar peserta |
| POST | `/api/users` | Tambah peserta manual |
| PATCH | `/api/users/:id` | Edit peserta |
| DELETE | `/api/users/:id` | Hapus peserta (cek sesi) |
| GET | `/api/users/:id/usage` | Cek sesi peserta |
| POST | `/api/users/import` | Import peserta Excel |
| GET | `/api/users/template` | Unduh template Excel |
| POST | `/api/imports` | Import AIKEN/GIFT (multipart) |
| POST | `/api/sessions/start` | Mulai/resume sesi ujian |
| GET | `/api/sessions/:id` | Sinkronisasi state sesi |
| PUT | `/api/sessions/:id/answers/:questionId` | Auto-save jawaban |
| POST | `/api/sessions/:id/violations` | Log pelanggaran + strike |
| POST | `/api/sessions/:id/pause` / `resume` | Jeda / lanjutkan timer |
| POST | `/api/sessions/:id/heartbeat` | Heartbeat koneksi |
| POST | `/api/sessions/:id/submit` | Kumpulkan & hitung skor |
| GET | `/api/sessions/:id/result` | Hasil ujian |
| GET | `/api/grading/pending` | Sesi yang menunggu nilai essay |
| POST | `/api/grading/sessions/:id` | Simpan nilai essay manual |
| GET | `/api/results/export` | Ekspor nilai Excel (`examId`, `mode=summary`/`category`) |
| POST | `/api/results/:sessionId/reset` | Reset sesi `force_submit` (khusus admin) |

## Deployment di VPS (Nginx Proxy Manager)

1. Arahkan domain ke IP VPS.
2. Di NPM, buat **Proxy Host**:
   - Forward Hostname/IP: `127.0.0.1` (atau IP host Docker)
   - Forward Port: `8080` (sesuai `APP_PORT`)
   - Aktifkan **Block Common Exploits** dan **Websockets Support**
   - Request SSL (Let's Encrypt) + Force SSL.
3. Pastikan container frontend nginx meneruskan `X-Forwarded-For`; backend sudah membaca header tersebut untuk pengikatan perangkat/IP.

### Penyimpanan lokal

Semua gambar soal dan screenshot pelanggaran disimpan di `./data/uploads` melalui bind mount. **Tidak ada AWS S3 / cloud storage.** Backup cukup dengan menyalin folder `data/uploads` dan volume database `db_data`.

## Pengembangan lokal

Backend membutuhkan Bun:

```bash
cd backend
bun install
bun run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite mem-proxy `/api` dan `/uploads` ke `http://localhost:3000`.

## Catatan

- Essay dinilai manual melalui tab **Nilai Essay** di panel admin; sesi dengan essay akan berstatus `grading_status = partial` sampai semua jawaban essay diberi nilai.
- Migrasi SQL bersifat idempoten dan dicatat di tabel `_migrations`.
- Untuk produksi, gunakan password database & JWT secret yang kuat, serta batasi akses langsung ke port database.
