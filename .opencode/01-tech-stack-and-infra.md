# Tech Stack & Infrastructure Guidelines

- **Database**: MariaDB.
- **Infrastruktur**: Aplikasi harus sepenuhnya di-dockerize. Siapkan `docker-compose.yml` yang mencakup service aplikasi dan database.
- **Environment**: Setup harus kompatibel untuk di-deploy di Linux VPS di belakang Nginx Proxy Manager.
- **Penyimpanan File**: Dilarang mutlak menggunakan AWS S3 atau layanan cloud pihak ketiga. Semua aset gambar untuk soal ujian (jpg/png) harus disimpan di local storage container atau bind mount volume.
- **Backend**: ElysiaJS.
- **Frontend**: Harus responsif (Mobile & Desktop) menggunakan React/Tailwind.