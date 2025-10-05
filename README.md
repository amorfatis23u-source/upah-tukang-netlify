# Upah Tukang Netlify Worker

## Arsitektur Ringkas
- **Konfigurasi klien** (`assets/js/config.js`) membaca `window.__ENV__` atau `<script id="env-config">` bertipe JSON untuk memperoleh `DATA_BACKEND`, `WEBAPP_URL`, `API_KEY`, dan `SHEET_ID`. Modul ini menyiapkan helper `createApiClient()` yang dipakai seluruh interaksi data di `form.html`.
- **Formulir klien** (`form.html`) merender kalkulator, men-generate snapshot HTML, lalu memilih target API (`/api/*` Netlify Function atau Google Apps Script) lewat helper konfigurasi.
- **Netlify Function fallback** (`netlify/functions/api.js`) menangani seluruh rute `GET/POST/PUT/DELETE /api/(list|item|save|update|remove)` dan menyimpan data ke Netlify Blobs Store (`upah20`). Fungsi ini juga menangani preflight `OPTIONS` untuk CORS.
- **Netlify Functions `snapshot` & `state`** mempertahankan arsip HTML dan state JSON sehingga snapshot lama bisa diunduh ulang melalui `/.netlify/functions/snapshot?key=...`.

## Variabel Lingkungan
Atur variabel di dashboard Netlify (`Site settings → Build & deploy → Environment`) atau pada file `.env` lokal ketika menjalankan `netlify dev`.

| Variabel | Wajib? | Deskripsi |
| --- | --- | --- |
| `DATA_BACKEND` | Opsional (default `NETLIFY_FN`) | Pilihan backend data (`NETLIFY_FN` untuk fallback Netlify, `APPS_SCRIPT` untuk Google Apps Script). |
| `WEBAPP_URL` | Wajib jika `DATA_BACKEND=APPS_SCRIPT` | URL Web App Apps Script (`https://script.google.com/macros/s/…/exec`). Untuk backend Netlify boleh dikosongkan (default `/api`). |
| `API_KEY` | Opsional | Diteruskan sebagai header `X-API-KEY` ke backend (berguna bila Apps Script mengecek token). |
| `SHEET_ID` | Opsional | Diteruskan sebagai header `X-SHEET-ID` (mis. agar Apps Script tahu spreadsheet mana yang harus dipakai). |
| `ALLOWED_ORIGIN` | Disarankan | Origin yang diizinkan mengakses fungsi Netlify (`https://contoh.netlify.app`). Dipakai oleh validasi CORS pada `netlify/functions/api.js`. |

> **Catatan:** Netlify otomatis menambahkan `DEPLOY_URL`, `DEPLOY_PRIME_URL`, `URL`, dan `NETLIFY_DEV_SERVER_URL`. Fungsi fallback akan menerima origin-origin ini sebagai fallback jika `ALLOWED_ORIGIN` kosong.

### Mengekspor ENV ke Front-End
`assets/js/config.js` akan mencari konfigurasi di salah satu sumber berikut:

1. Objek global `window.__ENV__`, misalnya:
   ```html
   <script>
     window.__ENV__ = {
       DATA_BACKEND: 'APPS_SCRIPT',
       WEBAPP_URL: 'https://script.google.com/macros/s/XXXX/exec',
       API_KEY: 'sekali_pakai',
       SHEET_ID: '123abc'
     };
   </script>
   ```
2. Elemen `<script id="env-config" type="application/json">` atau `<script id="__ENV__" type="application/json">` yang berisi JSON:
   ```html
   <script id="env-config" type="application/json">
     { "DATA_BACKEND": "NETLIFY_FN" }
   </script>
   ```

Jika tidak ada sumber di atas, aplikasi akan menggunakan backend Netlify (`/api/*`).

## Integrasi Google Apps Script
1. **Buat proyek Apps Script baru** yang terhubung dengan Google Sheet tujuan.
2. **Implementasikan `doGet/doPost/doPut/doDelete`**. Bacalah body JSON (`e.postData.contents`), perhatikan query `?new=1`, dan gunakan `ContentService.createTextOutput(JSON.stringify(payload))` dengan `setMimeType(ContentService.MimeType.JSON)` untuk merespons.
   - Tambahkan header CORS pada setiap respons, misalnya `output.setHeader('Access-Control-Allow-Origin', 'https://contoh.netlify.app')`, `output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY, X-SHEET-ID')`, dan `output.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')`.
   - Sediakan handler `doOptions` yang mengembalikan status 204 untuk melayani preflight browser.
3. **Deploy sebagai Web App** (`Deploy → Manage deployments → Web app`). Pilih *Execute as Me* dan *Who has access* → *Anyone with the link*. Catat URL `https://script.google.com/macros/s/.../exec` dan masukkan ke `WEBAPP_URL`.
4. **Isi ENV Netlify atau script inline** sesuai tabel di atas, lalu set `DATA_BACKEND=APPS_SCRIPT` agar front-end mengirim request ke Apps Script.

## Menjalankan Secara Lokal
1. **Instal dependensi** (sekali saja):
   ```bash
   npm install
   ```
2. **Jalankan Netlify Dev** (menyajikan situs statis + fungsi):
   ```bash
   netlify dev
   ```
   - Situs tersedia di `http://localhost:8888`.
   - Endpoint fallback tersedia di `http://localhost:8888/api/<route>` (mis. `POST /api/save`).
3. **Pengujian manual**:
   - **Skenario sukses**
     1. Buka `http://localhost:8888/form.html`.
     2. Isi data hingga tombol simpan aktif.
     3. Tekan *Simpan* dan pastikan Network devtools memperlihatkan respons `{"ok":true,...}` dari `/api/save` atau URL Apps Script.
     4. Verifikasi data tersimpan di Netlify Blobs (lihat log fungsi) atau di Google Sheets.
   - **Skenario gagal**
     1. Ganti `WEBAPP_URL` dengan URL yang salah atau matikan koneksi internet.
     2. Simpan ulang dan pastikan UI menampilkan notifikasi gagal, sedangkan log fungsi menunjukkan error HTTP.
4. **Memantau log fungsi lokal**: jalankan
   ```bash
   netlify functions:serve api snapshot state
   ```
   untuk melihat log `console.*` dari tiap fungsi.

## Monitoring & Logging Produksi
- Gunakan `netlify functions:tail --name api` untuk streaming log fungsi fallback.
- Dashboard Netlify → **Functions** menampilkan statistik dan log historis untuk `api`, `snapshot`, dan `state`.
- Tambahkan metadata ke payload `meta` (mis. periode, user) agar mudah dilacak di log backend.

## Checklist Pasca-Deploy
- [ ] Deploy produksi sukses di Netlify.
- [ ] `DATA_BACKEND`, `WEBAPP_URL`, `ALLOWED_ORIGIN`, dan token lain terisi sesuai lingkungan.
- [ ] Submit sampel dari situs produksi dan pastikan respons backend `{"ok":true}`.
- [ ] Catat `snapshotKey` dari respons lalu akses `/.netlify/functions/snapshot?key=<key>` untuk memastikan HTML tersimpan.
- [ ] Jika memakai Apps Script, konfirmasi spreadsheet menerima baris baru/pembaruan.

## Troubleshooting Umum
- **CORS Error (`Origin Not Allowed`)**: cek `ALLOWED_ORIGIN` pada Netlify ataupun header yang dikembalikan Apps Script.
- **HTTP 502/504**: backend eksternal lambat/timeout. Periksa log `netlify functions:tail --name api` atau log Apps Script.
- **Data tidak masuk ke Sheet**: validasi `API_KEY` / `SHEET_ID` pada Apps Script dan pastikan query `?new=1` serta `body.key` diproses.
- **Snapshot tidak ditemukan (`404`)**: kunci salah atau store Netlify Blobs belum terset. Deploy ulang dan cek bahwa fungsi `api` memiliki akses `NETLIFY_BLOBS_CONTEXT`.

## Referensi Tambahan
- Netlify CLI: <https://docs.netlify.com/cli/get-started/>
- Netlify Functions: <https://docs.netlify.com/functions/overview/>
- Netlify Blobs: <https://docs.netlify.com/blobs/overview/>
- Google Apps Script Web Apps: <https://developers.google.com/apps-script/guides/web>
