import { esc, md, initTheme, youtubeId, thumbnailUrl, embedUrl, htmlLessonFrame, DATA_PATH } from './common.js';
import { createVault, openVault, parseVault, checkPassword, VAULT_PATH, MIN_PASSWORD_LENGTH } from './vault.js';
import { validateData, validateCourse, validateLesson, LIMITS } from './schema.js';

// Anti-clickjacking : l'admin refuse de s'afficher dans un cadre d'un autre site.
if (window.top !== window.self) {
  document.documentElement.innerHTML = '';
  throw new Error('Admin intégré dans un cadre : affichage bloqué.');
}

initTheme();
const app = document.getElementById('app');
const savebar = document.getElementById('savebar');

// =====================================================================
// Stockage local (jamais de secret en clair)
// =====================================================================
const KEYS = { vault: 'admin-vault', draft: 'admin-draft', lockout: 'admin-lockout', legacy: 'gh-config' };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return { owner: '', repo: '' };
  const first = location.pathname.split('/').filter(Boolean)[0];
  const repo = first && !first.endsWith('.html') ? first : `${m[1]}.github.io`;
  return { owner: m[1], repo };
}

// Sur GitHub Pages, l'admin ne peut viser QUE le dépôt qui héberge ce site.
const SITE = guessRepo();
const ON_PAGES = !!SITE.owner;
const sameRepo = cfg => !ON_PAGES ||
  (cfg.owner.toLowerCase() === SITE.owner.toLowerCase() && cfg.repo.toLowerCase() === SITE.repo.toLowerCase());

/** Ancienne configuration (jeton EN CLAIR) : reprise une seule fois, puis effacée. */
function legacyConfig() {
  const old = store.get(KEYS.legacy);
  if (!old || typeof old !== 'object') return null;
  const pick = k => (typeof old[k] === 'string' ? old[k] : '');
  return { owner: pick('owner'), repo: pick('repo'), branch: pick('branch'), token: pick('token') };
}

// =====================================================================
// Session : le jeton déchiffré vit UNIQUEMENT en mémoire, dans cette variable.
// Il disparaît en verrouillant, en fermant l'onglet ou après 20 min d'inactivité.
// =====================================================================
let session = null;
let locking = false;
const IDLE_MS = 20 * 60 * 1000;
let idleTimer;
function armIdle() { clearTimeout(idleTimer); if (session) idleTimer = setTimeout(lock, IDLE_MS); }
['pointerdown', 'keydown', 'scroll', 'input'].forEach(ev => addEventListener(ev, armIdle, { passive: true, capture: true }));
function lock() {
  if (state.dirty) Draft.save();
  session = null; locking = true;
  location.hash = '#/';
  location.reload();
}
function showAuthNav() {
  document.querySelectorAll('[data-auth-only]').forEach(el => { el.hidden = !session; });
}
document.querySelector('[data-lock]')?.addEventListener('click', lock);

// Anti-force brute : délai croissant après 3 échecs (5 s, 10 s, 20 s… jusqu'à 5 min).
// La vraie protection reste le coût du déchiffrement (PBKDF2) et la longueur du mot de passe.
const Lockout = {
  get() { const s = store.get(KEYS.lockout); return { fails: Number.isInteger(s?.fails) ? s.fails : 0, until: Number(s?.until) || 0 }; },
  remaining() { return Math.max(0, this.get().until - Date.now()); },
  fail() {
    const fails = this.get().fails + 1;
    const wait = fails >= 3 ? Math.min(5 * 2 ** (fails - 3), 300) * 1000 : 0;
    store.set(KEYS.lockout, { fails, until: Date.now() + wait });
    return wait;
  },
  reset() { store.del(KEYS.lockout); },
};

// Coffres disponibles : celui du navigateur et celui publié dans le dépôt.
// Chacun est authentifié (AES-GCM) : un coffre modifié par un tiers ne s'ouvre simplement pas.
// Le coffre du dépôt fait foi : il est lu directement sur GitHub (à jour immédiatement),
// à défaut sur le site (GitHub Pages peut avoir quelques minutes de retard).
async function fetchRepoVault() {
  if (ON_PAGES) {
    try {
      const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(SITE.owner)}/${encodeURIComponent(SITE.repo)}/contents/${VAULT_PATH}?t=${Date.now()}`,
        { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (res.ok) return await res.json();
    } catch { /* limite de l'API publique atteinte, hors ligne… */ }
  }
  try {
    const res = await fetch(`${VAULT_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch { /* pas de coffre publié */ }
  return null;
}

async function vaultCandidates() {
  const raw = [await fetchRepoVault(), store.get(KEYS.vault)];
  const out = [];
  for (const v of raw) {
    try { const p = parseVault(v); if (sameRepo(p) && !out.some(x => x.ct === p.ct)) out.push(p); } catch { /* ignoré */ }
  }
  return out;
}

// =====================================================================
// API GitHub (avec la configuration déchiffrée)
// =====================================================================
const toB64 = str => { const b = new TextEncoder().encode(str); let s = ''; b.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); };
const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

const gh = cfg => ({
  base: `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`,
  headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  async readFile(path) {
    const res = await fetch(`${this.base}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`,
      { headers: this.headers, cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await ghError(res));
    const json = await res.json();
    let b64 = json.content;
    if (!b64 || json.encoding === 'none') { // fichier > 1 Mo : passer par l'API "blobs"
      const blob = await fetch(`${this.base}/git/blobs/${encodeURIComponent(json.sha)}`, { headers: this.headers, cache: 'no-store' });
      if (!blob.ok) throw new Error(await ghError(blob));
      b64 = (await blob.json()).content;
    }
    return { text: fromB64(b64), sha: json.sha };
  },
  async writeFile(path, text, sha, message) {
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT', headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, branch: cfg.branch, content: toB64(text), ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) throw new Error(await ghError(res));
    return (await res.json()).content.sha;
  },
  async read() {
    const f = await this.readFile(DATA_PATH);
    if (!f) return { data: { courses: [] }, sha: null };
    let parsed;
    try { parsed = JSON.parse(f.text); } catch { throw new Error(`${DATA_PATH} n'est pas un JSON valide.`); }
    return { data: validateData(parsed), sha: f.sha };
  },
  write(data, sha, message) {
    return this.writeFile(DATA_PATH, JSON.stringify(validateData(data), null, 2) + '\n', sha, message);
  },
  /** Publie le coffre chiffré dans le dépôt. Échoue si le jeton n'a pas le droit d'écrire : c'est voulu. */
  async saveVault(vault) {
    const cur = await this.readFile(VAULT_PATH);
    await this.writeFile(VAULT_PATH, JSON.stringify(vault, null, 2) + '\n', cur?.sha, 'Admin : coffre chiffré mis à jour');
  },
});

async function ghError(res) {
  let msg = ''; try { msg = (await res.json()).message; } catch {}
  if (res.status === 401) return 'Jeton GitHub invalide ou expiré.';
  if (res.status === 403) return `Accès refusé : le jeton doit avoir la permission « Contents : Read and write » sur ce dépôt. ${msg}`;
  if (res.status === 404) return 'Dépôt ou branche introuvable.';
  if (res.status === 409) return 'Le fichier a changé sur GitHub entre-temps. Rechargez les données puis réessayez.';
  return `Erreur GitHub ${res.status} : ${msg}`;
}

// =====================================================================
// État : données + brouillon local non publié
// =====================================================================
const state = { data: { courses: [] }, sha: null, dirty: false, saving: false, message: null };

const Draft = {
  save() { store.set(KEYS.draft, { data: state.data, sha: state.sha }); },
  /** Le brouillon vient du navigateur (partagé avec les autres pages du domaine) : il est revalidé. */
  load() {
    const d = store.get(KEYS.draft);
    if (!d) return null;
    try { return { data: validateData(d.data), sha: typeof d.sha === 'string' && /^[0-9a-f]{40}$/.test(d.sha) ? d.sha : null }; }
    catch (err) { this.clear(); state.message = { ok: false, text: `Brouillon local ignoré (données invalides) : ${err.message}` }; return null; }
  },
  clear() { store.del(KEYS.draft); },
};

function changed() { state.dirty = true; Draft.save(); renderSavebar(); }

async function loadFromSource() {
  const { data, sha } = await gh(session).read();
  state.data = data; state.sha = sha; state.dirty = false;
}

async function publish() {
  if (!session) return;
  state.saving = true; state.message = null; renderSavebar();
  try {
    state.sha = await gh(session).write(state.data, state.sha, 'Mise à jour des cours depuis l\'admin');
    state.dirty = false; Draft.clear();
    state.message = { ok: true, text: '✅ Publié ! Le site sera à jour dans 1 à 2 minutes.' };
  } catch (e) {
    state.message = { ok: false, text: e.message };
  }
  state.saving = false; renderSavebar();
}

function renderSavebar() {
  const msg = state.message;
  if (!state.dirty && !msg) { savebar.hidden = true; return; }
  savebar.hidden = false;
  savebar.className = `savebar ${msg && !msg.ok ? 'error' : msg?.ok && !state.dirty ? 'ok' : ''}`;
  savebar.innerHTML = `<div class="container savebar-inner">
    <span>${msg && !(msg.ok && state.dirty) ? esc(msg.text) : '● Modifications non publiées'}</span>
    <span class="row">
      ${state.dirty ? `<button class="btn ghost" data-action="discard">Annuler les modifications</button>
      <button class="btn" data-action="publish" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Publication…' : 'Publier sur GitHub'}</button>`
      : '<button class="link" data-action="dismiss">Fermer</button>'}
    </span></div>`;
}

savebar.addEventListener('click', async e => {
  if (!session) return;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'publish') publish();
  if (action === 'dismiss') { state.message = null; renderSavebar(); }
  if (action === 'discard' && confirm('Abandonner toutes les modifications non publiées ?')) {
    Draft.clear(); state.message = null;
    await loadFromSource().catch(err => { state.message = { ok: false, text: err.message }; });
    renderSavebar(); render();
  }
});
window.addEventListener('beforeunload', e => { if (state.dirty && !locking) e.preventDefault(); });

// =====================================================================
// Utilitaires
// =====================================================================
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function slugify(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'cours';
}
function uniqueSlug(title, id) {
  const base = slugify(title); let slug = base, i = 2;
  while (state.data.courses.some(c => c.slug === slug && c.id !== id)) slug = `${base}-${i++}`;
  return slug;
}
const findCourse = id => state.data.courses.find(c => c.id === id);
const formData = form => Object.fromEntries(new FormData(form));
const go = hash => { location.hash = hash; };
const notFound = () => `<div class="empty"><p>Élément introuvable.</p><p><a class="btn" href="#/">Retour</a></p></div>`;

// =====================================================================
// Vues
// =====================================================================
function dashboard() {
  const courses = state.data.courses;
  return `
  <div class="page-head"><h1>Mes cours</h1><a class="btn" href="#/cours/nouveau">+ Nouveau cours</a></div>
  ${!courses.length ? `<div class="empty"><p>Vous n'avez encore aucun cours.</p>
     <p><a class="btn" href="#/cours/nouveau">Créer un cours</a></p></div>` : `
  <table class="table">
    <thead><tr><th>Cours</th><th>Catégorie</th><th>Leçons</th><th>Statut</th><th></th></tr></thead>
    <tbody>${courses.map(c => `<tr>
      <td><a href="#/cours/${esc(c.id)}"><strong>${esc(c.title)}</strong></a></td>
      <td>${esc(c.category) || '—'}</td>
      <td>${c.lessons.length}</td>
      <td><span class="status ${c.published ? 'on' : 'off'}">${c.published ? 'Publié' : 'Brouillon'}</span></td>
      <td class="right"><a href="#/cours/${esc(c.id)}">Modifier</a></td>
    </tr>`).join('')}</tbody>
  </table>`}`;
}

function courseFields(c) {
  const categories = [...new Set(state.data.courses.map(x => x.category).filter(Boolean))];
  return `
  <label>Titre *<input name="title" value="${esc(c.title)}" required maxlength="200"></label>
  <label>Catégorie<input name="category" value="${esc(c.category)}" list="categories" placeholder="ex. Programmation, Langues…">
    <datalist id="categories">${categories.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
  <label>Description <small class="muted">(Markdown accepté)</small>
    <textarea name="description" rows="5">${esc(c.description)}</textarea></label>
  <label>Image de couverture (URL) <small class="muted">— vide : miniature de la 1ʳᵉ vidéo</small>
    <input name="cover_url" type="url" value="${esc(c.cover_url)}" placeholder="https://…"></label>
  <label class="checkbox"><input type="checkbox" name="published" ${c.published ? 'checked' : ''}> Publier ce cours (visible sur le site)</label>`;
}

function newCourse() {
  return `<a href="#/" class="back">← Tous les cours</a>
  <form class="panel" data-form="course-new"><h1>Nouveau cours</h1>${courseFields({})}
    <button class="btn">Créer le cours</button></form>`;
}

function editCourse(c) {
  if (!c) return notFound();
  const n = c.lessons.length;
  return `<a href="#/" class="back">← Tous les cours</a>
  <div class="page-head"><h1>${esc(c.title)}</h1></div>
  <div class="two-cols">
    <form class="panel" data-form="course-edit" data-id="${esc(c.id)}">
      <h2>Informations</h2>${courseFields(c)}
      <button class="btn">Enregistrer</button>
    </form>
    <section class="panel">
      <div class="page-head"><h2>Leçons (${n})</h2>
        <a class="btn" href="#/cours/${esc(c.id)}/lecon/nouvelle">+ Ajouter une leçon</a></div>
      ${!n ? '<p class="muted">Aucune leçon. Ajoutez la première !</p>' : ''}
      <ol class="admin-lessons">${c.lessons.map((l, i) => {
        const thumb = thumbnailUrl(l.youtube_url);
        return `<li>
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="no-thumb">📝</span>'}
          <a href="#/cours/${esc(c.id)}/lecon/${esc(l.id)}" class="grow">${i + 1}. ${esc(l.title)}</a>
          <button class="icon" data-move="-1" data-lesson="${esc(l.id)}" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon" data-move="1" data-lesson="${esc(l.id)}" title="Descendre" ${i === n - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon danger" data-delete-lesson="${esc(l.id)}" title="Supprimer">✕</button>
        </li>`;
      }).join('')}</ol>
    </section>
  </div>
  <div class="danger-zone"><button class="btn danger" data-delete-course="${esc(c.id)}">Supprimer le cours</button></div>`;
}

function lessonForm(c, l) {
  if (!c || (l === undefined)) return notFound();
  const isNew = !l;
  l = l || {};
  return `<a href="#/cours/${esc(c.id)}" class="back">← ${esc(c.title)}</a>
  <form class="panel" data-form="lesson" data-course="${esc(c.id)}" data-id="${esc(l.id || '')}">
    <h1>${isNew ? 'Nouvelle leçon' : 'Modifier la leçon'}</h1>
    <label>Titre *<input name="title" value="${esc(l.title)}" required maxlength="200" autofocus></label>
    <label>Vidéo YouTube <small class="muted">(lien de la vidéo, optionnel)</small>
      <input name="youtube_url" value="${esc(l.youtube_url)}" data-yt-input
        placeholder="https://www.youtube.com/watch?v=… ou https://youtu.be/…"></label>
    <div class="video preview" data-yt-preview hidden></div>
    <fieldset class="format-choice">
      <legend>Format du contenu</legend>
      <label class="checkbox"><input type="radio" name="format" value="markdown" ${l.format !== 'html' ? 'checked' : ''}> Markdown <small class="muted">— simple et rapide</small></label>
      <label class="checkbox"><input type="radio" name="format" value="html" ${l.format === 'html' ? 'checked' : ''}> HTML <small class="muted">— page libre avec CSS et JavaScript</small></label>
    </fieldset>
    <label><span data-content-label></span>
      <textarea name="content" rows="18" class="mono" data-content-input spellcheck="false">${esc(l.content)}</textarea></label>
    <div class="row import-row" data-html-only>
      <label class="btn ghost file-btn">📂 Importer un fichier .html
        <input type="file" accept=".html,.htm,text/html" data-import-html hidden></label>
      <small class="muted">Le contenu du fichier remplace celui de la zone de texte.</small>
    </div>
    <details open><summary>Aperçu du contenu</summary><div class="preview-box" data-content-preview></div></details>
    <div class="row">
      <button class="btn">Enregistrer</button>
      ${isNew ? '<button class="btn ghost" name="again" value="1">Enregistrer et ajouter une autre</button>' : ''}
    </div>
  </form>`;
}

const TOKEN_HELP = `<details><summary>Comment créer le jeton GitHub (2 minutes)</summary>
  <ol class="help">
    <li>Ouvrez <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens/new</a></li>
    <li>Nom : « Admin mes cours », avec une date d'expiration</li>
    <li><strong>Repository access</strong> : « Only select repositories » → ce dépôt uniquement</li>
    <li><strong>Permissions → Repository permissions → Contents</strong> : « Read and write »</li>
    <li>Générez le jeton, copiez-le et collez-le ici</li>
  </ol></details>`;

const passwordFields = (label = 'Mot de passe admin') => `
  <label>${label} <small class="muted">(${MIN_PASSWORD_LENGTH} caractères min., 3 types de caractères ou une longue phrase)</small>
    <input name="password" type="password" required minlength="${MIN_PASSWORD_LENGTH}" maxlength="256" autocomplete="new-password"></label>
  <label>Confirmer le mot de passe
    <input name="password2" type="password" required minlength="${MIN_PASSWORD_LENGTH}" maxlength="256" autocomplete="new-password"></label>`;

const vaultNote = `<p class="muted"><small>Le coffre chiffré est enregistré dans le dépôt : vous pourrez vous connecter
  depuis n'importe quel appareil avec le seul mot de passe. Sans le mot de passe, le jeton y est illisible (AES-256).</small></p>`;

function loginView() {
  return `<form class="panel narrow" data-form="login" autocomplete="off">
    <h1>🔒 Espace admin</h1>
    <p class="muted">Entrez le mot de passe pour déverrouiller l'admin.</p>
    <input type="text" name="username" autocomplete="username" value="admin" hidden>
    <label>Mot de passe<input name="password" type="password" required maxlength="256" autocomplete="current-password" autofocus></label>
    <div class="row"><button class="btn">Déverrouiller</button></div>
    <p data-form-msg role="alert"></p>
    <p class="muted"><small><a href="#/configurer">Mot de passe oublié ou nouvel appareil sans coffre ?</a>
      Il faudra recoller un jeton GitHub.</small></p>
  </form>`;
}

function setupView(hasVault) {
  const legacy = legacyConfig();
  const g = { ...guessRepo(), branch: 'main', ...(legacy ? Object.fromEntries(Object.entries(legacy).filter(([, v]) => v)) : {}) };
  return `${hasVault ? '<a href="#/" class="back">← Retour à la connexion</a>' : ''}
  <form class="panel" data-form="setup" autocomplete="off">
    <h1>${hasVault ? 'Réinitialiser l\'accès admin' : 'Protéger l\'admin par mot de passe'}</h1>
    ${legacy?.token ? `<div class="flash warn">Votre jeton GitHub était enregistré <strong>en clair</strong> dans ce navigateur.
      Choisissez un mot de passe : il sera chiffré, puis la copie en clair sera effacée.</div>` : ''}
    ${hasVault ? `<div class="flash warn">Un mot de passe admin existe déjà. Pour le remplacer, il faut un jeton GitHub
      autorisé à <strong>écrire</strong> dans ce dépôt : seul le propriétaire du dépôt peut donc le faire.</div>` : ''}
    <p class="muted">Le jeton GitHub est chiffré avec votre mot de passe. Sans ce mot de passe,
      personne ne peut modifier les cours, même en lisant le code du dépôt.</p>
    <div class="two-cols">
      <label>Propriétaire (compte GitHub)<input name="owner" value="${esc(ON_PAGES ? SITE.owner : g.owner)}" required maxlength="100" pattern="[A-Za-z0-9_.\\-]+" ${ON_PAGES ? 'readonly' : ''}></label>
      <label>Dépôt<input name="repo" value="${esc(ON_PAGES ? SITE.repo : g.repo)}" required maxlength="100" pattern="[A-Za-z0-9_.\\-]+" ${ON_PAGES ? 'readonly' : ''}></label>
    </div>
    <label>Branche<input name="branch" value="${esc(g.branch)}" required maxlength="200"></label>
    <label>Jeton d'accès GitHub (fine-grained token)
      <input name="token" type="password" value="${esc(legacy?.token || '')}" required autocomplete="off" placeholder="github_pat_…"></label>
    ${TOKEN_HELP}
    ${passwordFields()}
    ${vaultNote}
    <div class="row"><button class="btn">Chiffrer et enregistrer</button></div>
    <p data-form-msg role="alert"></p>
  </form>`;
}

function settings() {
  return `<a href="#/" class="back">← Tous les cours</a>
  <form class="panel" data-form="settings" autocomplete="off">
    <h1>Sécurité de l'admin</h1>
    <p class="muted">Connecté à <strong>${esc(session.owner)}/${esc(session.repo)}</strong> (branche <code>${esc(session.branch)}</code>).
      Le jeton est chiffré ; il n'est déchiffré qu'en mémoire, pendant la session.</p>
    <label>Mot de passe actuel<input name="current" type="password" required maxlength="256" autocomplete="current-password"></label>
    <label>Nouveau jeton GitHub <small class="muted">(laisser vide pour garder l'actuel)</small>
      <input name="token" type="password" autocomplete="off" placeholder="github_pat_…"></label>
    ${TOKEN_HELP}
    ${passwordFields('Nouveau mot de passe')}
    ${vaultNote}
    <div class="row"><button class="btn">Mettre à jour</button></div>
    <p data-form-msg role="alert"></p>
  </form>`;
}

// =====================================================================
// Routeur
// =====================================================================
let hasVault = false;
function render() {
  showAuthNav();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return ''; } });
  let html;
  // Rien n'est affiché ni modifiable sans session déverrouillée.
  if (!session) {
    app.innerHTML = hasVault && parts[0] !== 'configurer' ? loginView() : setupView(hasVault);
    return;
  }
  if (!parts.length) html = dashboard();
  else if (parts[0] === 'reglages') html = settings();
  else if (parts[0] === 'cours' && parts[1] === 'nouveau') html = newCourse();
  else if (parts[0] === 'cours' && parts[2] === 'lecon') {
    const c = findCourse(parts[1]);
    html = lessonForm(c, parts[3] === 'nouvelle' ? null : c?.lessons.find(l => l.id === parts[3]));
  } else if (parts[0] === 'cours') html = editCourse(findCourse(parts[1]));
  else html = notFound();
  app.innerHTML = html;
  initPreviews();
}

// Aperçus en direct (YouTube + Markdown)
function initPreviews() {
  const ytInput = app.querySelector('[data-yt-input]'), ytPreview = app.querySelector('[data-yt-preview]');
  if (ytInput) {
    let cur = null;
    const update = () => {
      const id = youtubeId(ytInput.value);
      ytInput.setCustomValidity(ytInput.value.trim() && !id ? 'Lien YouTube non reconnu' : '');
      if (id === cur) return;
      cur = id; ytPreview.hidden = !id;
      ytPreview.innerHTML = id ? `<iframe src="${esc(embedUrl(ytInput.value))}" title="Aperçu" allowfullscreen></iframe>` : '';
    };
    ytInput.addEventListener('input', update); update();
  }
  const input = app.querySelector('[data-content-input]');
  if (input) {
    const form = input.form, preview = app.querySelector('[data-content-preview]');
    const label = app.querySelector('[data-content-label]');
    let timer;
    const format = () => form.querySelector('input[name=format]:checked')?.value || 'markdown';
    const renderPreview = () => {
      const html = format() === 'html';
      label.innerHTML = html
        ? 'Code HTML de la leçon <small class="muted">(un fragment ou une page complète avec &lt;style&gt; et &lt;script&gt;)</small>'
        : 'Contenu de la leçon <small class="muted">(Markdown : # titres, **gras**, listes, `code`, liens… le HTML simple est aussi accepté)</small>';
      form.querySelectorAll('[data-html-only]').forEach(el => { el.hidden = !html; });
      preview.classList.toggle('prose', !html);
      preview.innerHTML = !input.value.trim() ? '<p class="muted"><em>Rien à afficher.</em></p>'
        : html ? htmlLessonFrame(input.value, 'Aperçu') : md(input.value);
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(renderPreview, 400); });
    form.querySelectorAll('input[name=format]').forEach(r => r.addEventListener('change', renderPreview));
    form.querySelector('[data-import-html]').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > LIMITS.content) { e.target.value = ''; alert(`Fichier trop volumineux (${Math.round(LIMITS.content / 1e6)} Mo max.).`); return; }
      const text = await file.text();
      input.value = text;
      const title = form.querySelector('input[name=title]');
      const t = text.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (!title.value.trim()) title.value = (t && t[1].trim()) || file.name.replace(/\.html?$/i, '');
      e.target.value = '';
      renderPreview();
    });
    renderPreview();
  }
}

// =====================================================================
// Actions
// =====================================================================
const formMsg = (form, text, ok = false) => {
  const out = form.querySelector('[data-form-msg]') || form.appendChild(Object.assign(document.createElement('p'), { role: 'alert' }));
  out.dataset.formMsg = '';
  out.className = ok ? 'ok-text' : 'error-text';
  out.textContent = text;
};
const busy = (form, on, label) => {
  const btn = form.querySelector('button:not([type=button])');
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  btn.disabled = on;
};

async function startSession(cfg) {
  if (!sameRepo(cfg)) { session = null; return render(); }
  session = cfg;
  store.del(KEYS.legacy);                 // plus aucune trace du jeton en clair
  Lockout.reset();
  armIdle();
  const draft = Draft.load();
  if (draft) { state.data = draft.data; state.sha = draft.sha; state.dirty = true; }
  else {
    try { await loadFromSource(); }
    catch (err) { state.message = { ok: false, text: err.message }; state.data = { courses: [] }; }
  }
  if (!location.hash.startsWith('#/') || location.hash.startsWith('#/configurer')) location.hash = '#/';
  renderSavebar(); render();
}

async function handleAuthForm(form, kind, v) {
  if (kind === 'login') {
    const wait = Lockout.remaining();
    if (wait) return formMsg(form, `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.`);
    busy(form, true, 'Déchiffrement…');
    const password = v.password;
    form.reset();
    let cfg = null;
    for (const vault of await vaultCandidates()) {
      try { cfg = await openVault(vault, password); break; } catch { /* essai suivant */ }
    }
    busy(form, false);
    if (!cfg) {
      const delay = Lockout.fail();
      return formMsg(form, `Mot de passe incorrect.${delay ? ` Nouvel essai possible dans ${delay / 1000} s.` : ''}`);
    }
    return startSession(cfg);
  }

  if (kind === 'setup' || kind === 'settings') {
    const newPassword = v.password;
    if (newPassword !== v.password2) return formMsg(form, 'Les deux mots de passe ne correspondent pas.');
    const weak = checkPassword(newPassword);
    if (weak) return formMsg(form, weak);
    let cfg;
    if (kind === 'setup') {
      cfg = { owner: v.owner.trim(), repo: v.repo.trim(), branch: v.branch.trim() || 'main', token: v.token.trim() };
      if (ON_PAGES) Object.assign(cfg, { owner: SITE.owner, repo: SITE.repo }); // impossible de viser un autre dépôt
    } else {
      // On redemande le mot de passe actuel avant tout changement.
      busy(form, true, 'Vérification…');
      let ok = false;
      for (const vault of await vaultCandidates()) {
        try { await openVault(vault, v.current); ok = true; break; } catch { /* essai suivant */ }
      }
      busy(form, false);
      if (!ok) { Lockout.fail(); return formMsg(form, 'Mot de passe actuel incorrect.'); }
      cfg = { ...session, token: v.token.trim() || session.token };
    }
    busy(form, true, 'Chiffrement…');
    try {
      const api = gh(cfg);
      await api.readFile(DATA_PATH);         // vérifie que le jeton fonctionne sur ce dépôt
      const vault = await createVault(cfg, newPassword);
      // Écrire le coffre dans le dépôt prouve que le jeton a le droit d'écriture :
      // un jeton d'un autre compte, ou en lecture seule, est refusé par GitHub ici.
      await api.saveVault(vault);
      store.set(KEYS.vault, vault);
      busy(form, false);
      if (kind === 'settings') { session = cfg; render(); return formMsg(app.querySelector('form'), '✅ Accès mis à jour.', true); }
      hasVault = true;
      return startSession(cfg);
    } catch (err) {
      busy(form, false);
      return formMsg(form, `❌ ${err.message}`);
    }
  }
}

/** Valide une saisie avant de la mettre dans les données (refuse liens javascript:, champs trop longs…). */
function guard(form, fn) {
  try { return fn(); } catch (err) { formMsg(form, `❌ ${err.message}`); return null; }
}

app.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form, v = formData(form);
  if (['login', 'setup', 'settings'].includes(kind)) return handleAuthForm(form, kind, v);
  if (!session) return render();
  const courseInput = () => ({
    title: v.title.trim(), category: v.category.trim(), description: v.description.trim(),
    cover_url: v.cover_url.trim(), published: v.published === 'on',
  });

  if (kind === 'course-new') {
    const c = guard(form, () => validateCourse({ id: uid(), ...courseInput(), lessons: [], updated_at: new Date().toISOString() }));
    if (!c) return;
    c.slug = uniqueSlug(c.title, c.id);
    state.data.courses.unshift(c); changed(); go(`#/cours/${c.id}`);
  }
  if (kind === 'course-edit') {
    const c = findCourse(form.dataset.id);
    if (!c) return render();
    const clean = guard(form, () => validateCourse({ ...c, ...courseInput(), updated_at: new Date().toISOString() }));
    if (!clean) return;
    Object.assign(c, clean);
    c.slug = uniqueSlug(c.title, c.id);
    changed(); render();
  }
  if (kind === 'lesson') {
    const c = findCourse(form.dataset.course);
    if (!c) return render();
    const existing = form.dataset.id ? c.lessons.find(l => l.id === form.dataset.id) : null;
    if (form.dataset.id && !existing) return render();
    const input = guard(form, () => validateLesson({ id: existing?.id || uid(), title: v.title, youtube_url: v.youtube_url,
      content: v.content, format: v.format === 'html' ? 'html' : 'markdown' }));
    if (!input) return;
    if (existing) Object.assign(existing, input);
    else c.lessons.push(input);
    c.updated_at = new Date().toISOString();
    changed();
    if (e.submitter?.name === 'again') { render(); app.querySelector('input[name=title]').focus(); }
    else go(`#/cours/${c.id}`);
  }
});

app.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || !session) return;
  const c = findCourse(app.querySelector('[data-form=course-edit]')?.dataset.id);
  if (t.dataset.move && c) {
    const i = c.lessons.findIndex(l => l.id === t.dataset.lesson), j = i + Number(t.dataset.move);
    [c.lessons[i], c.lessons[j]] = [c.lessons[j], c.lessons[i]];
    changed(); render();
  }
  if (t.dataset.deleteLesson && c) {
    const l = c.lessons.find(x => x.id === t.dataset.deleteLesson);
    if (confirm(`Supprimer la leçon « ${l.title} » ?`)) { c.lessons = c.lessons.filter(x => x !== l); changed(); render(); }
  }
  if (t.dataset.deleteCourse && confirm('Supprimer définitivement ce cours et toutes ses leçons ?')) {
    state.data.courses = state.data.courses.filter(x => x.id !== t.dataset.deleteCourse);
    changed(); go('#/');
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// =====================================================================
// Démarrage : on cherche un coffre ; sans mot de passe, rien n'est chargé.
// =====================================================================
hasVault = (await vaultCandidates()).length > 0;
if (hasVault && legacyConfig()?.token) store.del(KEYS.legacy);
render();
