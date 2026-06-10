/* =====================================================================
   apps-script.gs — Backend login untuk AI Tools Studio
   ---------------------------------------------------------------------
   CARA PAKAI:
   1. Buat Google Sheet baru. Buat sheet/tab bernama "Users".
      Kolom: A=email, B=nama, C=status (isi "AKTIF" untuk yang boleh masuk),
             D=token, E=last_login
   2. Extensions > Apps Script. Tempel kode ini.
   3. Ganti SHEET_ID dan APP_SECRET di bawah.
   4. Deploy > New deployment > Web app:
        - Execute as: Me
        - Who has access: Anyone   (BUKAN "Anyone with Google account")
   5. Salin URL .../exec ke AUTH.SCRIPT_URL di js/auth.js
   ===================================================================== */

const SHEET_ID   = 'GANTI_DENGAN_ID_GOOGLE_SHEET';
const APP_SECRET  = 'GANTI_DENGAN_SECRET_KAMU';   // samakan dengan js/auth.js
const SHEET_NAME  = 'Users';

function doGet(e) {
  const p = e.parameter || {};
  let out;

  if (p.app_secret !== APP_SECRET) {
    out = { status: 'GAGAL', message: 'Secret tidak valid.' };
  } else if (p.action === 'login') {
    out = handleLogin(p);
  } else if (p.action === 'cek') {
    out = handleCek(p);
  } else {
    out = { status: 'GAGAL', message: 'Action tidak dikenal.' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function findRow(email) {
  const sh = sheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === email) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

function handleLogin(p) {
  const email = String(p.email || '').trim().toLowerCase();
  const token = String(p.token || '');
  if (!email || !token) return { status: 'GAGAL', message: 'Data tidak lengkap.' };

  const found = findRow(email);
  if (!found) return { status: 'GAGAL', message: 'Email belum terdaftar.' };

  const status = String(found.data[2] || '').trim().toUpperCase();
  if (status !== 'AKTIF') return { status: 'GAGAL', message: 'Akun belum aktif. Hubungi admin.' };

  const sh = sheet();
  sh.getRange(found.row, 4).setValue(token);                 // simpan token (anti multi-login)
  sh.getRange(found.row, 5).setValue(new Date());            // last login
  return { status: 'SUKSES', nama: found.data[1] || email.split('@')[0] };
}

function handleCek(p) {
  const email = String(p.email || '').trim().toLowerCase();
  const token = String(p.token || '');
  const found = findRow(email);
  if (!found) return { status: 'GAGAL', valid: false };
  const valid = String(found.data[3] || '') === token
             && String(found.data[2] || '').trim().toUpperCase() === 'AKTIF';
  return { status: valid ? 'SUKSES' : 'GAGAL', valid: valid };
}
