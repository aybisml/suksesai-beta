/* =====================================================================
   api.js — Lapisan panggilan Gemini untuk AI Tools Studio
   ---------------------------------------------------------------------
   ATURAN PENTING (jangan dilanggar saat deploy ke Gemini Canvas):
   1. JANGAN MINIFY / MANGLE file ini.
   2. Tiap fungsi WAJIB punya literal `const apiKey = "";` di dalamnya.
      Canvas mengenali pola ini lalu meng-inject credential Gemini saat
      runtime (kuota memakai akun Google pengguna, bukan developer).
   ===================================================================== */

const _BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const _TXT  = `${_BASE}/gemini-2.0-flash:generateContent`;
const _IMG  = `${_BASE}/gemini-2.5-flash-image-preview:generateContent`;
const _TTS  = `${_BASE}/gemini-2.5-flash-preview-tts:generateContent`;

/* Matikan semua filter agar hasil tidak sering diblokir. */
const SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

/* --------------------------------------------------------------------
   Teks biasa (gemini-2.0-flash)
   ------------------------------------------------------------------ */
async function aiText(prompt, systemPrompt = null) {
  const apiKey = "";
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.85, maxOutputTokens: 4096 },
    safetySettings: SAFETY
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const r = await fetch(`${_TXT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw await _err(r, 'Gagal membuat teks.');
  const d = await r.json();
  return d?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
}

/* --------------------------------------------------------------------
   Teks terstruktur (JSON) — untuk output berupa daftar/objek
   ------------------------------------------------------------------ */
async function aiTextJSON(prompt, systemPrompt, schema) {
  const apiKey = "";
  const r = await fetch(`${_TXT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      safetySettings: SAFETY
    })
  });
  if (!r.ok) throw await _err(r, 'Gagal membuat data terstruktur.');
  const d = await r.json();
  const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  try { return JSON.parse(txt); } catch { throw new Error('Output bukan JSON valid.'); }
}

/* --------------------------------------------------------------------
   Gambar (gemini-2.5-flash-image-preview)
   - files kosong  → text-to-image
   - 1 file        → image-to-image
   - banyak file   → multi-reference
   - count         → jumlah variasi (generate paralel + retry)
   Mengembalikan { images: [dataURL...], text: '...' }
   ------------------------------------------------------------------ */
async function aiImageFull(prompt, files = [], aspectRatio = '1:1', count = 1) {
  // Encode file sekali saja, lalu dipakai ulang untuk tiap variasi.
  const refParts = [];
  for (const f of files) {
    const data = await fileToBase64(f);
    refParts.push({ inlineData: { mimeType: f.type || 'image/jpeg', data } });
  }

  const callOnce = async () => {
    const apiKey = "";
    const parts = [{ text: prompt }, ...refParts];
    const r = await fetch(`${_IMG}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio }
        },
        safetySettings: SAFETY
      })
    });
    if (!r.ok) throw await _err(r, 'Gagal membuat gambar.');
    const d = await r.json();
    const ps = d?.candidates?.[0]?.content?.parts || [];
    const images = ps.filter(p => p.inlineData).map(p => `data:image/png;base64,${p.inlineData.data}`);
    const text = ps.filter(p => p.text).map(p => p.text).join('\n').trim();
    return { images, text };
  };

  const n = Math.max(1, Math.min(count || 1, 6));
  let attempts = 0, images = [], text = '';
  while (attempts < 3 && images.length === 0) {
    attempts++;
    const settled = await Promise.allSettled(Array.from({ length: n }, callOnce));
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        images.push(...s.value.images);
        if (!text && s.value.text) text = s.value.text;
      }
    }
  }
  if (images.length === 0) {
    throw new Error('Akun Google ini sudah mencapai batas kuota. Silakan coba lagi nanti atau gunakan akun Google lain.');
  }
  return { images, text };
}

/* --------------------------------------------------------------------
   Text-to-Speech / Voice Over (gemini-2.5-flash-preview-tts)
   ------------------------------------------------------------------ */
async function aiTTS(text, voiceName = 'Charon', pitch = 0, volume = 0) {
  const apiKey = "";
  const r = await fetch(`${_TTS}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          pitch, volumeGainDb: volume,
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        }
      }
    })
  });
  if (!r.ok) throw await _err(r, 'Gagal membuat audio.');
  const d = await r.json();
  const part = d?.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData?.data) throw new Error('Tidak ada audio dihasilkan.');
  const rate = parseInt(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] || '24000', 10);
  return pcmToWavBlobUrl(part.inlineData.data, rate);
}

/* ---------------------------- Helpers ------------------------------ */
async function _err(r, fallback) {
  let msg = fallback;
  try { const e = await r.json(); msg = e?.error?.message || fallback; } catch (_) {}
  if (r.status === 429) msg = 'Kuota Gemini akun ini sudah penuh. Coba beberapa saat lagi atau pakai akun Google lain.';
  return new Error(msg);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function pcmToWavBlobUrl(pcmBase64, sampleRate = 24000) {
  const bin = atob(pcmBase64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const numCh = 1, bps = 16, byteRate = sampleRate * numCh * bps / 8;
  const buf = new ArrayBuffer(44 + pcm.length), view = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true);
  w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true);
  view.setUint16(32, numCh * bps / 8, true); view.setUint16(34, bps, true);
  w(36, 'data'); view.setUint32(40, pcm.length, true);
  new Uint8Array(buf).set(pcm, 44);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

window.AIApi = { aiText, aiTextJSON, aiImageFull, aiTTS, fileToBase64 };
