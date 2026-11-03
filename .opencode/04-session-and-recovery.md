# Session State & Network Recovery

- **Auto-Save**: Jawaban peserta harus dikirim ke backend setiap kali mereka memilih opsi (via asynchronous API call), bukan di akhir ujian saja.
- **Local State**: Simpan state jawaban sementara dan timer di `localStorage` atau `sessionStorage`.
- **Koneksi Terputus**: Jika koneksi internet peserta terputus, jangan batalkan ujian. Tampilkan UI "Reconnecting..." dan bekukan timer/halaman hingga koneksi kembali, lalu sinkronisasi ulang dengan backend.
- **Validasi Device**: Gunakan token JWT yang diikat dengan *user agent* atau *IP address* pada saat sesi dimulai untuk mencegah satu akun login di dua perangkat (laptop dan gawai) secara bersamaan.