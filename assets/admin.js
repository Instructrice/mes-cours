import { esc, md, coverHtml, loadData, normalize, initTheme, youtubeId, thumbnailUrl, embedUrl, DATA_PATH } from './common.js';

initTheme();
const app = document.getElementById('app');
const savebar = document.getElementById('savebar');

// =====================================================================
// Configuration GitHub (stockée uniquement dans ce navigateur)
// =====================================================================
function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return { owner: '', repo: '' };
  const first = location.pathname.split('/').filter(Boolean)[0];
  const repo = first && !first.endsWith('.html') ? first : `${m[1]}.github.io`;
  return { owner: m[1], repo };
}
const Config = {
  get() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('gh-config') || '{}'); } catch {}
    return { ...guessRepo(), branch: 'main', token: '', ...Object.fromEntries(Object.entries(saved).filter(([, v]) => v)) };
  },
  save(cfg) { try { localStorage.setItem('gh-config', JSON.stringify(cfg)); } catch {} },
  ready() { const c = this.get(); return !!(c.owner && c.repo && c.token); },
};

// Encodage base64 compatible UTF-8 (accents, emojis)
const toB64 = str => { const b = new TextEncoder().encode(str); let s = ''; b.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); };
const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

const GitHub = {
  url(cfg) { return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${DATA_PATH}`; },
  headers(cfg) { return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28' }; },
  async read() {
    const cfg = Config.get();
    const res = await fetch(`${this.url(cfg)}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, { headers: this.headers(cfg), cache: 'no-store' });
    if (res.status === 404) return { data: { courses: [] }, sha: null };
    if (!res.ok) throw new Error(await this.error(res));
    const json = await res.json();
    return { data: normalize(JSON.parse(fromB64(json.content))), sha: json.sha };
  },
  async write(data, sha, message) {
    const cfg = Config.get();
    const res = await fetch(this.url(cfg), {
      method: 'PUT', headers: { ...this.headers(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, branch: cfg.branch, content: toB64(JSON.stringify(data, null, 2) + '\n'), ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) throw new Error(await this.error(res));
    return (await res.json()).content.sha;
  },
  async error(res) {
    let msg = ''; try { msg = (await res.json()).message; } catch {}
    if (res.status === 401) return 'Jeton GitHub invalide ou expiré (Réglages).';
    if (res.status === 403) return `Accès refusé : le jeton doit avoir la permission « Contents : Read and write » sur ce dépôt. ${msg}`;
    if (res.status === 404) return 'Dépôt ou branche introuvable : vérifiez les Réglages.';
    if (res.status === 409) return 'Le fichier a changé sur GitHub entre-temps. Rechargez les données puis réessayez.';
    return `Erreur GitHub ${res.status} : ${msg}`;
  },
};

// =====================================================================
// État : données + brouillon local non publié
// =====================================================================
const state = { data: { courses: [] }, sha: null, dirty: false, saving: false, message: null };

const Draft = {
  save() { try { localStorage.setItem('admin-draft', JSON.stringify({ data: state.data, sha: state.sha })); } catch {} },
  load() { try { return JSON.parse(localStorage.getItem('admin-draft') || 'null'); } catch { return null; } },
  clear() { try { localStorage.removeItem('admin-draft'); } catch {} },
};

function changed() { state.dirty = true; Draft.save(); renderSavebar(); }

async function loadFromSource() {
  if (Config.ready()) {
    const { data, sha } = await GitHub.read();
    state.data = data; state.sha = sha;
  } else {
    state.data = await loadData().catch(() => ({ courses: [] }));
  }
  state.dirty = false;
}

async function publish() {
  if (!Config.ready()) { location.hash = '#/reglages'; return; }
  state.saving = true; state.message = null; renderSavebar();
  try {
    state.sha = await GitHub.write(state.data, state.sha, 'Mise à jour des cours depuis l\'admin');
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
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'publish') publish();
  if (action === 'dismiss') { state.message = null; renderSavebar(); }
  if (action === 'discard' && confirm('Abandonner toutes les modifications non publiées ?')) {
    Draft.clear(); state.message = null;
    await loadFromSource().catch(err => { state.message = { ok: false, text: err.message }; });
    renderSavebar(); render();
  }
});
window.addEventListener('beforeunload', e => { if (state.dirty) e.preventDefault(); });

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
function setupNotice() {
  if (Config.ready()) return '';
  return `<div class="flash warn">Pour enregistrer vos cours sur GitHub, configurez d'abord votre
    <a href="#/reglages">jeton d'accès GitHub</a>. En attendant, vos modifications restent dans ce navigateur.</div>`;
}

function dashboard() {
  const courses = state.data.courses;
  return `${setupNotice()}
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
    <label>Contenu de la leçon <small class="muted">(Markdown : # titres, **gras**, listes, \`code\`, liens…)</small>
      <textarea name="content" rows="16" class="mono" data-md-input>${esc(l.content)}</textarea></label>
    <details><summary>Aperçu du contenu</summary><div class="prose preview-box" data-md-preview></div></details>
    <div class="row">
      <button class="btn">Enregistrer</button>
      ${isNew ? '<button class="btn ghost" name="again" value="1">Enregistrer et ajouter une autre</button>' : ''}
    </div>
  </form>`;
}

function settings() {
  const c = Config.get();
  return `<a href="#/" class="back">← Tous les cours</a>
  <form class="panel" data-form="settings">
    <h1>Réglages GitHub</h1>
    <p class="muted">L'admin enregistre vos cours dans le fichier <code>${DATA_PATH}</code> de votre dépôt.
      Ces réglages restent <strong>uniquement dans ce navigateur</strong>.</p>
    <div class="two-cols">
      <label>Propriétaire (compte GitHub)<input name="owner" value="${esc(c.owner)}" required></label>
      <label>Dépôt<input name="repo" value="${esc(c.repo)}" required></label>
    </div>
    <label>Branche<input name="branch" value="${esc(c.branch)}" required></label>
    <label>Jeton d'accès personnel (fine-grained token)
      <input name="token" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></label>
    <details open><summary>Comment créer le jeton (2 minutes)</summary>
      <ol class="help">
        <li>Ouvrez <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
        <li>Nom : « Admin mes cours », expiration au choix</li>
        <li><strong>Repository access</strong> : « Only select repositories » → votre dépôt</li>
        <li><strong>Permissions → Repository permissions → Contents</strong> : « Read and write »</li>
        <li>Générez le jeton, copiez-le et collez-le ici</li>
      </ol>
      <p class="muted">⚠️ Ne partagez jamais ce jeton. N'utilisez cet admin que sur vos appareils personnels.</p>
    </details>
    <div class="row">
      <button class="btn">Enregistrer et tester</button>
      ${c.token ? '<button class="btn ghost" type="button" data-forget>Oublier le jeton</button>' : ''}
    </div>
    <p data-test-result></p>
  </form>`;
}

// =====================================================================
// Routeur
// =====================================================================
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  let html;
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
  const mdInput = app.querySelector('[data-md-input]'), mdPreview = app.querySelector('[data-md-preview]');
  if (mdInput) {
    const r = () => { mdPreview.innerHTML = md(mdInput.value || '*Rien à afficher.*'); };
    mdInput.addEventListener('input', r); r();
  }
}

// =====================================================================
// Actions
// =====================================================================
app.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form, v = formData(form);
  const courseInput = () => ({
    title: v.title.trim(), category: v.category.trim(), description: v.description.trim(),
    cover_url: v.cover_url.trim(), published: v.published === 'on',
  });

  if (kind === 'course-new') {
    const c = { id: uid(), ...courseInput(), lessons: [], updated_at: new Date().toISOString() };
    c.slug = uniqueSlug(c.title, c.id);
    state.data.courses.unshift(c); changed(); go(`#/cours/${c.id}`);
  }
  if (kind === 'course-edit') {
    const c = findCourse(form.dataset.id);
    Object.assign(c, courseInput(), { updated_at: new Date().toISOString() });
    c.slug = uniqueSlug(c.title, c.id);
    changed(); render();
  }
  if (kind === 'lesson') {
    const c = findCourse(form.dataset.course);
    const input = { title: v.title.trim(), youtube_url: v.youtube_url.trim(), content: v.content };
    if (form.dataset.id) Object.assign(c.lessons.find(l => l.id === form.dataset.id), input);
    else c.lessons.push({ id: uid(), ...input });
    c.updated_at = new Date().toISOString();
    changed();
    if (e.submitter?.name === 'again') { render(); app.querySelector('input[name=title]').focus(); }
    else go(`#/cours/${c.id}`);
  }
  if (kind === 'settings') {
    const cfg = { owner: v.owner.trim(), repo: v.repo.trim(), branch: v.branch.trim() || 'main', token: v.token.trim() };
    Config.save(cfg);
    const out = form.querySelector('[data-test-result]');
    out.textContent = 'Test de connexion…';
    try {
      const remote = await GitHub.read();
      state.sha = remote.sha;
      if (!state.dirty) state.data = remote.data;
      out.innerHTML = `<span class="ok-text">✅ Connecté à ${esc(cfg.owner)}/${esc(cfg.repo)} — ${remote.data.courses.length} cours trouvé(s).</span>`;
    } catch (err) { out.innerHTML = `<span class="error-text">❌ ${esc(err.message)}</span>`; }
  }
});

app.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
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
  if (t.hasAttribute('data-forget')) { Config.save({ ...Config.get(), token: '' }); render(); }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// =====================================================================
// Démarrage
// =====================================================================
try {
  const draft = Draft.load();
  if (draft) {
    state.data = normalize(draft.data); state.sha = draft.sha; state.dirty = true;
  } else {
    await loadFromSource();
  }
} catch (err) {
  state.message = { ok: false, text: err.message };
  state.data = await loadData().catch(() => ({ courses: [] }));
}
renderSavebar();
render();
