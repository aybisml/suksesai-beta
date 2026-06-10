/* =====================================================================
   renderer.js — Membangun form dari tool.inputs & menjalankan generate
   ===================================================================== */

const ASPECTS = ['1:1', '3:4', '9:16'];

/* Bangun panel kerja untuk sebuah tool. */
function renderTool(tool) {
  const host = document.getElementById('tool-view');
  host.innerHTML = '';

  // Header
  const head = el('div', 'tool-head');
  head.innerHTML = `
    <button class="back-btn" id="back-btn" aria-label="Kembali">&larr;</button>
    <div>
      <h1>${esc(tool.name)}</h1>
      <p>${esc(tool.description || '')}</p>
    </div>`;
  host.appendChild(head);
  head.querySelector('#back-btn').onclick = () => location.hash = '#/';

  // Tool tipe link (mis. Opal) — tampilkan kartu CTA, tanpa form
  if (tool.outputType === 'link') {
    const card = el('div', 'link-card');
    card.innerHTML = `
      <div class="link-card-icon">🎬</div>
      <p>${esc(tool.outputDesc || '')}</p>
      <a class="btn btn-primary" href="${esc(tool.linkUrl)}" target="_blank" rel="noopener">
        ${esc(tool.linkLabel || 'Buka')} &nbsp;↗
      </a>
      <span class="link-note">Dibuka di tab baru pada layanan eksternal gratis.</span>`;
    host.appendChild(card);
    return;
  }

  // Workspace: form (kiri) + hasil (kanan)
  const work = el('div', 'workspace');
  const form = el('div', 'panel form-panel');
  const result = el('div', 'panel result-panel');
  result.innerHTML = `<div class="result-empty">
      <div class="result-empty-mark">✦</div>
      <p>Isi form lalu tekan <strong>Generate</strong>. Hasil muncul di sini.</p>
    </div>`;
  work.appendChild(form);
  work.appendChild(result);
  host.appendChild(work);

  // Bangun field
  const fields = {};
  (tool.inputs || []).forEach(inp => {
    const wrap = el('div', 'field');
    const id = 'f_' + inp.id;
    const req = inp.required ? ' <span class="req">*</span>' : '';
    const label = el('label', 'field-label');
    label.innerHTML = esc(inp.label || inp.id) + req;
    label.setAttribute('for', id);
    wrap.appendChild(label);

    let control;
    switch (inp.type) {
      case 'file':
        control = buildFileField(id, inp);
        break;
      case 'select':
        control = el('select', 'control');
        control.id = id;
        (inp.options || []).forEach(o => {
          const opt = el('option'); opt.value = o; opt.textContent = o; control.appendChild(opt);
        });
        break;
      case 'range':
        control = buildRangeField(id, inp);
        break;
      case 'textarea':
        control = el('textarea', 'control');
        control.id = id; control.rows = 4;
        if (inp.placeholder) control.placeholder = inp.placeholder;
        break;
      default: // text
        control = el('input', 'control');
        control.id = id; control.type = 'text';
        if (inp.placeholder) control.placeholder = inp.placeholder;
    }
    wrap.appendChild(control);
    form.appendChild(wrap);
    fields[inp.id] = inp;
  });

  // Selector aspect ratio untuk output gambar (jika tool tidak punya input rasio sendiri)
  const isImage = tool.outputType === 'image' || tool.outputType === 'image_text';
  const hasRatioInput = (tool.inputs || []).some(i => /rasio|aspek|ratio/i.test(i.id));
  if (isImage && !hasRatioInput) {
    const wrap = el('div', 'field');
    wrap.innerHTML = `<label class="field-label">Rasio Gambar</label>`;
    const seg = el('div', 'segmented'); seg.id = 'aspect-seg';
    ASPECTS.forEach((a, i) => {
      const b = el('button', 'seg-btn' + (i === 0 ? ' active' : ''));
      b.type = 'button'; b.textContent = a; b.dataset.val = a;
      b.onclick = () => { seg.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); };
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    form.appendChild(wrap);
  }

  // Tombol generate
  const btn = el('button', 'btn btn-primary btn-block');
  btn.id = 'generate-btn';
  btn.innerHTML = genLabel(tool);
  form.appendChild(btn);
  btn.onclick = () => runTool(tool, fields, { form, result, btn });
}

function genLabel(tool) {
  if (tool.outputType === 'sound') return '🔊 Buat Audio';
  if (tool.outputType === 'text') return '✨ Buat Teks';
  return '✨ Generate';
}

function buildFileField(id, inp) {
  const box = el('div', 'filedrop');
  box.innerHTML = `
    <input type="file" id="${id}" accept="${esc(inp.accept || 'image/*')}" hidden>
    <div class="filedrop-inner">
      <span class="filedrop-icon">⬆</span>
      <span class="filedrop-text">Ketuk untuk pilih foto</span>
    </div>
    <div class="filedrop-preview hidden"></div>`;
  const input = box.querySelector('input');
  const inner = box.querySelector('.filedrop-inner');
  const prev = box.querySelector('.filedrop-preview');
  inner.onclick = () => input.click();
  input.onchange = () => {
    if (!input.files[0]) return;
    const url = URL.createObjectURL(input.files[0]);
    prev.innerHTML = `<img src="${url}" alt="preview"><button type="button" class="filedrop-remove">Ganti</button>`;
    prev.classList.remove('hidden');
    inner.classList.add('hidden');
    prev.querySelector('.filedrop-remove').onclick = () => {
      input.value = ''; prev.classList.add('hidden'); inner.classList.remove('hidden');
    };
  };
  return box;
}

function buildRangeField(id, inp) {
  const wrap = el('div', 'range-wrap');
  const min = inp.min ?? 1, max = inp.max ?? 5, def = inp.default ?? min;
  wrap.innerHTML = `
    <input type="range" id="${id}" class="control range" min="${min}" max="${max}" value="${def}" step="1">
    <output class="range-out">${def}</output>`;
  const r = wrap.querySelector('input'), o = wrap.querySelector('output');
  r.oninput = () => { o.textContent = r.value; };
  return wrap;
}

/* Kumpulkan nilai, isi template, panggil API yang sesuai, render hasil. */
async function runTool(tool, fields, ui) {
  const { result, btn } = ui;

  // Kumpulkan nilai + validasi required
  const values = {};
  const files = [];
  let aspect = '1:1';
  let count = 1;
  let missing = null;

  for (const inp of (tool.inputs || [])) {
    const node = document.getElementById('f_' + inp.id);
    if (inp.type === 'file') {
      const f = node?.files?.[0];
      if (f) files.push(f);
      if (inp.required && !f) missing = inp.label || inp.id;
      values[inp.id] = f ? '(foto terlampir)' : '';
    } else {
      const v = (node?.value ?? '').trim();
      values[inp.id] = v;
      if (inp.required && !v) missing = inp.label || inp.id;
      if (/rasio|aspek|ratio/i.test(inp.id) && v) aspect = normalizeAspect(v);
      if (/jumlah|qty|count/i.test(inp.id) && v) count = parseInt(v, 10) || 1;
    }
  }
  // Aspect dari segmented control (jika ada)
  const seg = document.querySelector('#aspect-seg .seg-btn.active');
  if (seg) aspect = seg.dataset.val;

  if (missing) {
    toast(`Lengkapi dulu: ${missing}`, 'warn');
    return;
  }

  // Susun prompt dari template
  const prompt = fillTemplate(tool.promptTemplate || tool.name, values);

  // Loading state
  btn.disabled = true;
  const labelBackup = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Memproses…';
  result.innerHTML = loadingBlock(tool);

  try {
    if (tool.outputType === 'text') {
      const text = await AIApi.aiText(prompt);
      renderTextResult(result, text);
    } else if (tool.outputType === 'sound') {
      const voice = values['voice'] || values['suara'] || 'Charon';
      const url = await AIApi.aiTTS(values['teks'] || values['script'] || prompt, voice);
      renderAudioResult(result, url);
    } else { // image / image_text
      const { images, text } = await AIApi.aiImageFull(prompt, files, aspect, count);
      renderImageResult(result, images, text, tool);
    }
    toast('Selesai!', 'ok');
  } catch (e) {
    result.innerHTML = `<div class="result-error">
        <div class="result-error-mark">!</div>
        <p>${esc(e.message || 'Terjadi kesalahan.')}</p>
        <button class="btn btn-ghost" id="retry-btn">Coba lagi</button>
      </div>`;
    result.querySelector('#retry-btn').onclick = () => runTool(tool, fields, ui);
  } finally {
    btn.disabled = false;
    btn.innerHTML = labelBackup;
  }
}

/* ----------------------------- Render hasil ----------------------------- */
function renderImageResult(host, images, text, tool) {
  host.innerHTML = '';
  if (text) {
    const cap = el('div', 'result-caption');
    cap.innerHTML = `<p>${esc(text)}</p><button class="chip" id="copy-cap">Salin teks</button>`;
    host.appendChild(cap);
    cap.querySelector('#copy-cap').onclick = () => copyText(text);
  }
  const grid = el('div', 'img-grid');
  images.forEach((src, i) => {
    const cell = el('div', 'img-cell');
    cell.innerHTML = `<img src="${src}" alt="hasil ${i + 1}">
      <a class="img-dl" download="${slug(tool.name)}-${i + 1}.png" href="${src}">⬇ Unduh</a>`;
    grid.appendChild(cell);
  });
  host.appendChild(grid);
}

function renderTextResult(host, text) {
  host.innerHTML = '';
  const box = el('div', 'text-result');
  box.innerHTML = `<div class="text-body">${esc(text).replace(/\n/g, '<br>')}</div>
    <div class="result-actions">
      <button class="btn btn-ghost" id="copy-txt">Salin</button>
    </div>`;
  host.appendChild(box);
  box.querySelector('#copy-txt').onclick = () => copyText(text);
}

function renderAudioResult(host, url) {
  host.innerHTML = '';
  const box = el('div', 'audio-result');
  box.innerHTML = `<audio controls src="${url}"></audio>
    <a class="btn btn-ghost" download="voiceover.wav" href="${url}">⬇ Unduh audio</a>`;
  host.appendChild(box);
}

function loadingBlock(tool) {
  if (tool.outputType === 'text' || tool.outputType === 'sound') {
    return `<div class="skeleton-text"><span></span><span></span><span></span><span style="width:60%"></span></div>`;
  }
  return `<div class="img-grid">
      <div class="img-cell skel"></div><div class="img-cell skel"></div>
    </div>`;
}

/* ----------------------------- Util ----------------------------- */
function fillTemplate(tpl, values) {
  return String(tpl).replace(/\{\{?\s*([\w-]+)\s*\}?\}/g, (m, key) => {
    const v = values[key];
    return (v === undefined || v === '') ? 'tidak ditentukan' : v;
  });
}
function normalizeAspect(v) {
  const m = String(v).match(/(\d+)\s*[:x]\s*(\d+)/);
  if (m) { const a = `${m[1]}:${m[2]}`; return ASPECTS.includes(a) ? a : '1:1'; }
  return '1:1';
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function copyText(t) { navigator.clipboard.writeText(t).then(() => toast('Tersalin!', 'ok')).catch(() => toast('Gagal menyalin', 'warn')); }

window.AIRenderer = { renderTool };
