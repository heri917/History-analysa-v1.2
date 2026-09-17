ARN STORE • RIWAYAT & ANALISA V1.1 — SYNC BUILD

Struktur aplikasi:
- 1 HP fisik = 1 service case = 1 kartu Riwayat.
- 1 case dapat memiliki banyak detail kerusakan.
- Action dan Part terpisah.
- PCS 1–9 melalui pilihan cepat, >9 dapat diketik.
- Rangkuman menghitung kasus unik untuk Tipe HP/Kerusakan/Part.
- Part Terpakai menjumlahkan PCS.
- Tanpa login/password, memakai Supabase publishable key.
- Offline: data baru/edit/hapus disimpan di IndexedDB dan dicoba sinkron otomatis saat online.
- Arsip memakai RPC archive_oldest_45_cases dan hanya dijalankan ketika active cases >= 90.

Supabase:
https://mtpsxtkqltjypmisbguh.supabase.co

Catatan:
SQL V1.1 harus sudah terpasang dan test V1.1 sudah PASS sebelum file ini dipakai.
Jangan memakai service_role/secret key di frontend.
