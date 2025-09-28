# PR: Fix "Buka Data" membuka isi yang sama & dukungan snapshot per periode
Perubahan utama:
- `rekap.html`: tautan ke form menggunakan `histStart` & `histEnd` → unik per (mulai, selesai).
- `form.html`: snapshot V2 (`upah20_snap__<mulai>__<selesai>`) + fallback ke format lama `?hist=<mulai>`.
- Kompatibel dengan Netlify Blobs Functions untuk sinkron server.

Langkah merge:
1. Buat branch baru di GitHub (mis. `fix/hist-v2`).
2. Ganti file `rekap.html` dan `form.html` dengan versi pada PR ini.
3. Commit & buka Pull Request.
4. Deploy akan otomatis berjalan di Netlify.
