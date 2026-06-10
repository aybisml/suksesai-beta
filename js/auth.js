/* =====================================================================
   auth.js — Login via Google Apps Script
   ---------------------------------------------------------------------
   Akses dikontrol lewat whitelist di Google Sheet (tanpa monetisasi).
   Isi 3 nilai di bawah dengan milikmu sendiri (lihat README + apps-script.gs).
   ===================================================================== */

const AUTH = {
  SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxczRRUg42rgIWO8FXWnjWDIjIxjl0xOL0gbom5MMwTodQtdu2ZWEEatV_GpeqtEtZP/exec", // .../exec
  APP_SECRET: "suksesai231",
  PRODUCT_ID: "ai-tools-studio",
};

const LS = {
  email: "aitools_email",
  token: "aitools_token",
  name: "aitools_name",
};

function _genToken() {
  return (
    "tk_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

function isConfigured() {
  return AUTH.SCRIPT_URL.indexOf("GANTI_") === -1;
}

function getSession() {
  const email = localStorage.getItem(LS.email);
  if (!email) return null;
  return {
    email,
    token: localStorage.getItem(LS.token),
    name: localStorage.getItem(LS.name) || email.split("@")[0],
  };
}

/* Login: kirim email ke Apps Script, harap balasan { status:"SUKSES", nama } */
async function login(email) {
  email = (email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Format email tidak valid.");
  }

  // Mode demo: kalau Apps Script belum dikonfigurasi, izinkan masuk lokal
  // supaya UI tetap bisa dicoba sebelum backend siap.
  if (!isConfigured()) {
    localStorage.setItem(LS.email, email);
    localStorage.setItem(LS.token, _genToken());
    localStorage.setItem(LS.name, email.split("@")[0]);
    return { email, name: email.split("@")[0], demo: true };
  }

  const token = _genToken();
  const url =
    AUTH.SCRIPT_URL +
    "?action=login" +
    "&email=" +
    encodeURIComponent(email) +
    "&token=" +
    encodeURIComponent(token) +
    "&app_secret=" +
    encodeURIComponent(AUTH.APP_SECRET) +
    "&product=" +
    encodeURIComponent(AUTH.PRODUCT_ID);

  let data;
  try {
    const r = await fetch(url);
    data = await r.json();
  } catch (e) {
    throw new Error(
      "Tidak bisa terhubung ke server. Periksa koneksi atau konfigurasi Apps Script.",
    );
  }

  if (data.status !== "SUKSES") {
    throw new Error(
      data.message ||
        "Email belum terdaftar. Hubungi admin untuk mendapatkan akses.",
    );
  }

  localStorage.setItem(LS.email, email);
  localStorage.setItem(LS.token, token);
  localStorage.setItem(LS.name, data.nama || email.split("@")[0]);
  return { email, name: data.nama || email.split("@")[0] };
}

function logout() {
  localStorage.removeItem(LS.email);
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.name);
}

/* Cek berkala apakah sesi masih valid (anti multi-login). Opsional. */
async function verifySession() {
  const s = getSession();
  if (!s || !isConfigured()) return true;
  try {
    const url =
      AUTH.SCRIPT_URL +
      "?action=cek" +
      "&email=" +
      encodeURIComponent(s.email) +
      "&token=" +
      encodeURIComponent(s.token) +
      "&app_secret=" +
      encodeURIComponent(AUTH.APP_SECRET) +
      "&product=" +
      encodeURIComponent(AUTH.PRODUCT_ID);
    const r = await fetch(url);
    const d = await r.json();
    return d.status === "SUKSES" || d.valid === true;
  } catch (_) {
    return true; // jangan paksa logout kalau hanya gangguan jaringan
  }
}

window.AIAuth = { login, logout, getSession, verifySession, isConfigured };
