/* =====================================================================
   app.js — Orchestrator AI Tools Studio
   ===================================================================== */

const APP = { categories: [], tools: [], byId: {} };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindShell();
  applyTheme(localStorage.getItem('aitools_theme') || 'light');

  // Gerbang login
  const session = AIAuth.getSession();
  if (session) {
    showApp(session);
  } else {
    showLogin();
  }
}

/* ----------------------------- Data ----------------------------- */
async function loadCatalog() {
  if (APP.tools.length) return;
  const res = await fetch(window.TOOLS_URL || 'tools.json');
  const data = await res.json();
  APP.categories = data.categories || [];
  APP.categories.forEach(c => {
    (c.tools || []).forEach(t => {
      t._cat = c.id; t._catLabel = c.label; t._catIcon = c.icon;
      APP.tools.push(t); APP.byId[t.id] = t;
    });
  });
}

/* ----------------------------- Login ----------------------------- */
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');

  const form = document.getElementById('login-form');
  const input = document.getElementById('login-email');
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Masuk…';
    try {
      const s = await AIAuth.login(input.value);
      showApp(s);
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Masuk';
    }
  };
}

async function showApp(session) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('user-name').textContent = session.name;
  document.getElementById('user-initial').textContent = (session.name[0] || '?').toUpperCase();

  await loadCatalog();
  buildSidebar();
  router();
}

/* ----------------------------- Shell ----------------------------- */
function bindShell() {
  window.addEventListener('hashchange', router);

  document.getElementById('theme-toggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('aitools_theme', next);
  };

  document.getElementById('logout-btn').onclick = () => {
    AIAuth.logout();
    location.hash = '#/';
    location.reload();
  };

  const search = document.getElementById('search-input');
  search.addEventListener('input', () => {
    const q = search.value.trim();
    if (location.hash.startsWith('#/tool/')) location.hash = '#/';
    renderHome(q);
  });

  document.getElementById('menu-toggle').onclick = () =>
    document.getElementById('app-shell').classList.toggle('nav-open');
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  const all = el('a', 'nav-item active');
  all.href = '#/'; all.innerHTML = `<span class="nav-icon">▦</span> Semua Tools <span class="nav-count">${APP.tools.length}</span>`;
  nav.appendChild(all);

  APP.categories.forEach(c => {
    const a = el('a', 'nav-item');
    a.href = `#/cat/${c.id}`;
    a.innerHTML = `<span class="nav-icon">${c.icon || '•'}</span> ${esc(c.label)} <span class="nav-count">${(c.tools || []).length}</span>`;
    nav.appendChild(a);
  });
}

function setActiveNav(hash) {
  document.querySelectorAll('.nav-item').forEach(a =>
    a.classList.toggle('active', a.getAttribute('href') === hash));
}

/* ----------------------------- Router ----------------------------- */
function router() {
  const h = location.hash || '#/';
  document.getElementById('app-shell').classList.remove('nav-open');
  const home = document.getElementById('home-view');
  const tool = document.getElementById('tool-view');

  if (h.startsWith('#/tool/')) {
    const t = APP.byId[h.slice(7)];
    if (t) {
      home.classList.add('hidden'); tool.classList.remove('hidden');
      AIRenderer.renderTool(t);
      window.scrollTo(0, 0);
      return;
    }
  }
  if (h.startsWith('#/cat/')) {
    tool.classList.add('hidden'); home.classList.remove('hidden');
    setActiveNav(h);
    renderHome('', h.slice(6));
    return;
  }
  // default: home
  tool.classList.add('hidden'); home.classList.remove('hidden');
  setActiveNav('#/');
  renderHome('');
}

/* ----------------------------- Home grid ----------------------------- */
function renderHome(query = '', catId = null) {
  const view = document.getElementById('home-view');
  view.innerHTML = '';

  let cats = APP.categories;
  if (catId) cats = APP.categories.filter(c => c.id === catId);

  const q = query.toLowerCase();
  let shown = 0;

  if (query) {
    const hits = APP.tools.filter(t =>
      t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    view.appendChild(sectionTitle(`Hasil pencarian "${query}"`, hits.length));
    view.appendChild(toolGrid(hits));
    shown = hits.length;
  } else {
    if (!catId) view.appendChild(heroBlock());
    cats.forEach(c => {
      const list = c.tools || [];
      const sec = el('section', 'cat-section');
      sec.appendChild(sectionTitle(`${c.icon || ''} ${c.label}`, list.length, c.description));
      sec.appendChild(toolGrid(list));
      view.appendChild(sec);
      shown += list.length;
    });
  }

  if (shown === 0) {
    view.appendChild(emptyState(query));
  }
}

function heroBlock() {
  const h = el('div', 'hero');
  h.innerHTML = `
    <h1>Studio kreatif untuk <span class="grad">jualan &amp; konten</span></h1>
    <p>${APP.tools.length} alat AI untuk foto produk, copywriting, desain, SEO, dan media sosial — semua dalam satu tempat.</p>`;
  return h;
}

function sectionTitle(title, count, desc) {
  const d = el('div', 'sec-head');
  d.innerHTML = `<h2>${esc(title)} <span class="sec-count">${count}</span></h2>${desc ? `<p>${esc(desc)}</p>` : ''}`;
  return d;
}

function toolGrid(tools) {
  const grid = el('div', 'tool-grid');
  tools.forEach(t => {
    const card = el('a', 'tool-card');
    card.href = `#/tool/${t.id}`;
    card.innerHTML = `
      <div class="tool-card-top">
        <span class="tool-badge ${badgeClass(t.outputType)}">${badgeLabel(t.outputType)}</span>
      </div>
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.description || '')}</p>`;
    grid.appendChild(card);
  });
  return grid;
}

function emptyState(query) {
  const d = el('div', 'empty');
  d.innerHTML = `<div class="empty-mark">⌕</div>
    <p>Tidak ada tool yang cocok dengan "${esc(query)}".</p>
    <a class="btn btn-ghost" href="#/">Lihat semua tools</a>`;
  return d;
}

function badgeLabel(t) {
  return ({ image: 'Gambar', text: 'Teks', image_text: 'Gambar + Teks', sound: 'Audio', link: 'Video' })[t] || 'Tool';
}
function badgeClass(t) {
  return ({ image: 'b-img', text: 'b-txt', image_text: 'b-mix', sound: 'b-snd', link: 'b-link' })[t] || '';
}
