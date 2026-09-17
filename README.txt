ARN STORE • RIWAYAT & ANALISA V1.1

PWA GitHub Pages, tanpa login/password.
Supabase project: https://mtpsxtkqltjypmisbguh.supabase.co

KONEKSI
- Menggunakan Supabase publishable key, bukan service_role.
- Data utama: public.service_cases dan public.service_case_details.
- Riwayat, Rangkuman, dan Part Terpakai dibentuk dari data kasus aktif.
- Satu HP = satu service_case_id = satu kasus/riwayat. Satu kasus dapat memiliki banyak detail kerusakan/tindakan/part.

PENYIMPANAN
- Online: simpan ke Supabase lalu baca ulang data server untuk memastikan tampilan mengikuti database.
- Offline: data masuk antrean IndexedDB dan disinkronkan otomatis saat koneksi kembali.
- ID kasus stabil untuk mencegah duplikasi saat sinkronisasi ulang.

LOADING
- Logo loading tetap diam.
- Hanya ring/lingkaran loading yang berputar mengelilingi logo.
- Logo loading diperkecil.
- Teks: ARN STORE / History and Analysis.
- Batas maksimum loading screen: 45 detik.
- Pemeriksaan koneksi database tidak membuat layar tertahan lebih dari 12 detik sebelum aplikasi tetap dibuka.

TAMPILAN
- Logo horizontal ARN Store sebagai logo interface/header.
- Logo bulat + gear sebagai ikon aplikasi/PWA.
- Panel hitam dengan watermark ARN samar.
- Aksen hitam, putih, emas.
- Tiga menu: Riwayat, Rangkuman, Part Terpakai.
- Menu utility: Refresh Data, Filter Periode, Arsip, Tentang Aplikasi.

ARSIP
- Batas aktif 90 kasus.
- Saat arsip dijalankan, 45 kasus terlama dikompres dan 45 terbaru tetap aktif.
- Arsip hanya mempertahankan ringkasan tipe HP, part, dan PCS sesuai rancangan V1.1.

PENGHAPUSAN
- Hapus Total menghapus kasus dan detail terkait secara permanen dari database.
- Konfirmasi menampilkan: “Data ini akan dihapus secara permanen.” dan countdown 10 detik pada tombol Hapus Data.
