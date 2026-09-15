ARN STORE • RIWAYAT & ANALISA v1.1

PWA GitHub Pages, tanpa login/password.
Supabase project: https://mtpsxtkqltjypmisbguh.supabase.co

KONEKSI
- Menggunakan Supabase publishable key, bukan service_role.
- Data utama: public.service_history.
- Riwayat dibaca dari public.service_history_view.
- Rangkuman dan Part Terpakai dihitung dari riwayat aktif.

LOADING
- Logo loading yang diberikan pengguna tetap diam.
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

PENTING SUPABASE
Foundation v1.0 saat ini memakai RLS untuk role authenticated. Karena aplikasi ini sengaja TANPA LOGIN, jalankan SUPABASE_NO_LOGIN_SETUP.sql sekali di SQL Editor project yang sama. Tanpa langkah ini browser akan mendapat error permission/RLS.

Jangan mengubah Foundation v1.0 atau menghapus data riwayat untuk memasang file ini.
