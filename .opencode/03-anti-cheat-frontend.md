# Anti-Cheat & Lockdown Browser Rules (Frontend)

Saat mengimplementasikan antarmuka ujian, agen WAJIB mengaktifkan batasan berikut menggunakan HTML5 dan Web API sesuai alur berikut:

1. **Wajib Fullscreen (Fullscreen API)**: 
   - Tombol "Mulai Ujian" hanya akan berfungsi sekaligus memicu mode `fullscreen`.
   - Ujian tidak boleh berjalan jika browser tidak dalam mode layar penuh.

2. **Deteksi Perpindahan Aplikasi & Penalti Overlay (Page Visibility & Window Focus)**:
   - Gunakan event listener `visibilitychange` (jika `document.hidden` bernilai true) dan `blur` (jika jendela kehilangan fokus).
   - Deteksi juga event `fullscreenchange` jika pengguna mencoba menekan tombol ESC untuk keluar dari mode layar penuh.
   - **Sanksi Langsung:** Jika salah satu dari tiga event di atas terdeteksi, UI harus langsung memunculkan **Overlay Peringatan Layar Penuh** (mengunci ujian), menghentikan *timer* sementara, mencatat pelanggaran (strike) ke *state* lokal, dan mengirimkan log pelanggaran tersebut ke backend secara asinkron (ke tabel `exam_violation_logs`).

3. **Aturan "3-Strike" (Force Submit)**:
   - Terapkan toleransi maksimal 3 kali pelanggaran perpindahan aplikasi/keluar fullscreen.
   - Jika akumulasi pelanggaran (strike) peserta > 3, maka UI WAJIB langsung memicu fungsi API untuk memaksakan *submit* jawaban secara final dan mengeluarkan pengguna (logout) dari sesi ujian saat itu juga, tanpa opsi untuk kembali.

4. **Pembatasan Interaksi Standar**:
   - Blokir klik kanan (`contextmenu`).
   - Blokir seleksi teks, *copy*, *cut*, dan *paste*.
   - Blokir kombinasi pintasan keyboard sebisa mungkin melalui event `keydown`.

5. **Deteksi Injeksi Ekstensi Browser (MutationObserver khusus arsitektur React)**:
   - Aplikasi React akan di-mount pada `<div id="root">`.
   - Pasang `MutationObserver` pada `document.body`, TETAPI atur agar HANYA memantau injeksi elemen yang masuk sebagai *direct children* dari `<body>`.
   - **Aturan Pengecualian Mutlak:** Observer WAJIB MENGABAIKAN (whitelist) semua perubahan DOM yang terjadi di dalam `<div id="root">` karena itu adalah aktivitas normal dari Virtual DOM React.
   - Jika aplikasi membutuhkan elemen Modal atau Overlay Peringatan yang menggunakan `React.createPortal`, elemen tersebut harus di-render ke wadah khusus, misalnya `<div id="modal-root">`. Observer wajib mengabaikan ID ini.
   - Jika ada elemen HTML yang masuk ke `<body>` dan BUKAN merupakan `#root` atau `#modal-root`, maka itu dipastikan adalah ekstensi browser. Hapus elemen tersebut, catat 1 strike, dan picu state React untuk menampilkan Overlay Peringatan.