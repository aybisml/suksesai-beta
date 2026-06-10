# AI Tools Studio

Aplikasi AI Tools Studio untuk Gemini Canvas — **135 tools** (134 berbasis Gemini + 1 bonus video via Google Opal), arsitektur data-driven, login via Google Apps Script. **Tanpa monetisasi, tanpa API berbayar.**

## Struktur file

```
├── index.html         → entry untuk preview lokal / GitHub Pages (path relatif)
├── canvas-entry.html  → thin shell untuk ditempel ke Gemini Canvas (path jsDelivr)
├── tools.json         → katalog 135 tools (mesin membaca file ini)
├── css/style.css      → tampilan (tema terang & gelap)
├── js/
│   ├── api.js         → panggilan Gemini — JANGAN DIMINIFY
│   ├── auth.js        → login via Apps Script (isi 3 konfigurasi)
│   ├── renderer.js    → pembangun form + render hasil
│   └── app.js         → orchestrator (login gate, sidebar, search, routing)
└── apps-script.gs     → backend Google Apps Script (login + whitelist)
```

## Langkah deploy (urut)

### 1. Backend (Google Apps Script)
1. Buat Google Sheet, tambahkan tab **`Users`** dengan kolom: `A=email`, `B=nama`, `C=status`, `D=token`, `E=last_login`. Isi `C` dengan **`AKTIF`** untuk user yang boleh masuk.
2. **Extensions → Apps Script**, tempel isi `apps-script.gs`.
3. Ganti `SHEET_ID` dan `APP_SECRET`.
4. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access:* **Anyone** (bukan "Anyone with Google account").
5. Salin URL `.../exec`.

### 2. Konfigurasi `js/auth.js`
Isi tiga nilai:
```js
SCRIPT_URL: 'URL .../exec dari langkah 1',
APP_SECRET: 'sama persis dengan APP_SECRET di apps-script.gs',
PRODUCT_ID: 'ai-tools-studio'
```
> Selama `SCRIPT_URL` belum diisi, login berjalan dalam **mode demo** (siapa pun bisa masuk) supaya UI bisa dicoba dulu.

### 3. Push ke GitHub
- Repo harus **PUBLIC** (jsDelivr tidak melayani repo private).
- Upload semua file menjaga struktur folder `js/` dan `css/`.

### 4. Tempel ke Gemini Canvas
1. Buka `canvas-entry.html`, ganti semua **`USERNAME/REPO`** dengan repo kamu (4 baris script + 1 link CSS + 1 `TOOLS_URL`).
2. Salin seluruh isi file itu ke Gemini Canvas.

### 5. Setelah setiap update kode
Purge cache jsDelivr lalu buka Canvas **baru**:
```
https://purge.jsdelivr.net/gh/USERNAME/REPO@main/js/api.js
https://purge.jsdelivr.net/gh/USERNAME/REPO@main/js/app.js
... (purge tiap file yang berubah, termasuk tools.json & style.css)
```

## Aturan penting
- **`js/api.js` JANGAN diminify.** Pola `const apiKey = ""` di tiap fungsi harus utuh agar Canvas bisa inject credential. Kalau di-mangle jadi `const a=""`, semua generate gagal dengan error *"Method doesn't allow unregistered callers"*.
- File lain (`app.js`, `renderer.js`, `auth.js`) boleh diminify bila perlu.
- Kuota Gemini memakai akun Google **tiap pengguna** — gratis untukmu. Saat kuota seorang user habis, muncul pesan untuk mencoba lagi / ganti akun (sudah ada retry 3× otomatis).

## Menambah / mengubah tool
Cukup edit **`tools.json`** — tidak perlu sentuh kode. Tiap tool butuh: `id`, `name`, `description`, `outputType` (`image` / `text` / `image_text` / `sound` / `link`), `inputs[]`, dan `promptTemplate` (placeholder `{{id-field}}`). Push → purge → selesai.

## Tes lokal
Jalankan server statis di folder ini, lalu buka `index.html`:
```
python3 -m http.server 8000
```
UI penuh bisa dicoba. Generate AI hanya berfungsi di dalam Gemini Canvas (atau jika kamu menempelkan API key sendiri ke variabel `apiKey` untuk uji coba).
