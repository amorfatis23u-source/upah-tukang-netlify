# Upah Tukang Netlify Worker

## Arsitektur Ringkas
- **Formulir klien** (`form.html`) mengumpulkan data dan merender HTML snapshot.
- **Netlify Function `save`** (`/.netlify/functions/save`) menerima payload `{ html, meta }`, melakukan validasi CORS berdasar `ALLOWED_ORIGIN`, lalu meneruskan payload ke layanan hulu yang ditentukan oleh `SAVE_TARGET_URL` (mis. Google Apps Script) dengan timeout 15 detik.
- **Netlify Functions `snapshot` & `state`** menyimpan/mengambil HTML snapshot dan state JSON pada Netlify Blobs Store (`upah20`). Snapshot yang tersimpan bisa diambil kembali via `/.netlify/functions/snapshot?key=...`.
- **Target eksternal** (Google Apps Script atau webhook lain) menerima payload dari fungsi `save` untuk persisten data (spreadsheet, database, dll.).

## Konfigurasi Environment Netlify
Atur variabel-variabel berikut pada dashboard Netlify (`Site settings → Build & deploy → Environment`):

| Variabel | Deskripsi |
| --- | --- |
| `SAVE_TARGET_URL` | Endpoint HTTPS tujuan (mis. URL Google Apps Script) yang menerima payload dari fungsi `save`. Wajib ada. |
| `ALLOWED_ORIGIN` | Origin yang diizinkan mengakses fungsi `save` (mis. `https://example.netlify.app`). Digunakan untuk header CORS. |
| `NETLIFY_BLOBS_CONTEXT` *(otomatis)* | Disediakan Netlify saat fungsi berjalan di produksi. Tidak perlu diubah manual. |

> **Catatan:** Selama preview/production deploy Netlify akan menyuntikkan `DEPLOY_URL`, `DEPLOY_PRIME_URL`, `URL`, dan `NETLIFY_DEV_SERVER_URL`. Fungsi `save` secara otomatis menerima origin-origin ini untuk fallback, tetapi `ALLOWED_ORIGIN` tetap direkomendasikan untuk eksplisit.

Untuk pengembangan lokal, buat berkas `.env` (tidak di-commit) di akar repo:

```env
SAVE_TARGET_URL="https://script.google.com/macros/s/XXXX/exec"
ALLOWED_ORIGIN="http://localhost:8888"
```

Kemudian jalankan `netlify dev` agar variabel dimuat.

## Menjalankan Secara Lokal
1. **Instal dependensi** (sekali saja):
   ```bash
   npm install
   ```
2. **Jalankan dev server Netlify** (membuka situs statis + fungsi):
   ```bash
   netlify dev
   ```
   - Aplikasi statis tersedia di `http://localhost:8888` secara default.
   - Fungsi dapat diakses via `http://localhost:8888/.netlify/functions/<nama>`.
3. **Pengujian manual:**
   - **Skenario sukses**
     1. Buka `http://localhost:8888/form.html`.
     2. Isi data minimal hingga tombol simpan aktif.
     3. Kirim formulir dan pastikan respons fungsi `save` menampilkan `{"ok":true,...}` di console devtools/network.
     4. Pastikan Google Apps Script (atau target lain) menerima dan menyimpan payload.
   - **Skenario gagal**
     1. Ubah `SAVE_TARGET_URL` di `.env` ke URL yang salah, atau matikan jaringan.
     2. Ulangi submit formulir dan pastikan fungsi `save` menampilkan pesan error (HTTP 502/504) dan UI menampilkan notifikasi gagal.
     3. Periksa bahwa log Netlify memuat pesan `failed to reach SAVE_TARGET_URL`.
4. **Memantau log fungsi lokal**: CLI akan menampilkan `console.info/error` secara realtime di terminal `netlify dev`. Untuk log terpisah:
   ```bash
   netlify functions:serve save snapshot state
   ```

## Monitoring & Logging Produksi
- Gunakan `netlify functions:tail --name save` untuk streaming log dari deploy aktif.
- Dashboard Netlify → **Functions** menampilkan statistik & log historis.
- Untuk men-debug request tertentu, tambahkan metadata di payload `meta` agar mudah dilacak di log target eksternal.

## Checklist Pasca-Deploy
- [ ] Deploy berhasil (`Production deploy` berstatus sukses di Netlify).
- [ ] Variabel `SAVE_TARGET_URL` & `ALLOWED_ORIGIN` terisi dan cocok dengan domain formulir.
- [ ] Lakukan submit sampel dari situs produksi dan pastikan respons `{"ok":true}`.
- [ ] Catat nilai `key` dari respons `/.netlify/functions/snapshot` lalu akses `/.netlify/functions/snapshot?key=<key>` untuk memastikan HTML tersimpan.
- [ ] Verifikasi target eksternal (Google Sheets/dll.) menerima snapshot/meta terbaru.

## Troubleshooting Umum
- **CORS Error (`Origin Not Allowed`)**: pastikan `ALLOWED_ORIGIN` sesuai dengan domain formulir (termasuk protokol). Deploy ulang setelah mengubah environment variable.
- **Timeout / 502 / 504 dari fungsi `save`**: cek apakah `SAVE_TARGET_URL` dapat diakses publik dan merespons < 15 detik. Untuk proses lama, pertimbangkan queue atau worker terpisah.
- **Offline / jaringan lokal terputus saat dev**: `netlify dev` akan gagal menghubungi target eksternal. Gunakan mock server lokal (`npx http-echo-server`) atau set `SAVE_TARGET_URL` ke endpoint yang tersedia offline.
- **Snapshot tidak ditemukan (`404`)**: pastikan key yang digunakan benar dan deploy memiliki akses Netlify Blobs. Jalankan ulang deploy jika `NETLIFY_BLOBS_CONTEXT` belum terset.

## Referensi Tambahan
- Netlify CLI: <https://docs.netlify.com/cli/get-started/>
- Netlify Functions: <https://docs.netlify.com/functions/overview/>
- Netlify Blobs: <https://docs.netlify.com/blobs/overview/>
