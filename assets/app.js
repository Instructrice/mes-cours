import { esc, md, plain, coverHtml, loadData, Progress, initTheme, videoHtml, youtubeId, lessonBodyHtml } from './common.js';

initTheme();
const app = document.getElementById('app');
let data;

const notFound = msg => `<div class="empty"><h1>Introuvable</h1><p>${esc(msg)}</p>
  <p><a class="btn" href="#/">Retour aux cours</a></p></div>`;

// ---------- Accueil ----------
function home(params) {
  const q = (params.get('q') || '').trim().toLowerCase();
  const cat = params.get('categorie') || '';
  const published = data.courses.filter(c => c.published);
  const categories = [...new Set(published.map(c => c.category).filter(Boolean))].sort();
  const list = published
    .filter(c => !q || `${c.title} ${c.description}`.toLowerCase().includes(q))
    .filter(c => !cat || c.category === cat);
  document.title = 'Mes cours';

  return `
  <section class="hero">
    <h1>Apprendre, à votre rythme</h1>
    <p class="muted">Retrouvez tous vos cours, leurs vidéos et votre progression.</p>
    <form class="search" id="search">
      <input type="search" name="q" value="${esc(params.get('q') || '')}" placeholder="Rechercher un cours…">
      ${categories.length ? `<select name="categorie">
        <option value="">Toutes les catégories</option>
        ${categories.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>` : ''}
      <button class="btn">Rechercher</button>
    </form>
  </section>
  ${!list.length ? `<div class="empty">${q || cat
      ? '<p>Aucun cours ne correspond à votre recherche. <a href="#/">Tout afficher</a></p>'
      : '<p>Aucun cours publié pour l\'instant.</p><p><a class="btn" href="admin.html">Créer mon premier cours</a></p>'}</div>` : ''}
  <div class="grid">
    ${list.map(c => {
      const n = c.lessons.length, done = Progress.count(c);
      return `<a class="card ${done ? 'started' : ''}" href="#/cours/${esc(c.slug)}">
        ${coverHtml(c)}
        <div class="card-body">
          ${c.category ? `<span class="tag">${esc(c.category)}</span>` : ''}
          <h2>${esc(c.title)}</h2>
          <p class="muted clamp">${esc(plain(c.description))}</p>
          <div class="card-foot">
            <span class="muted">${n} leçon${n > 1 ? 's' : ''}</span>
            <div class="progress small"><div class="bar" style="width:${n ? (done / n) * 100 : 0}%"></div></div>
          </div>
        </div></a>`;
    }).join('')}
  </div>`;
}

// ---------- Page cours ----------
function lessonListHtml(course, currentId, compact = false) {
  const done = Progress.get(course.id);
  return `<ol class="lesson-list ${compact ? 'compact' : ''}">${course.lessons.map((l, i) => `
    <li class="${done.has(l.id) ? 'done' : ''} ${l.id === currentId ? 'current' : ''}">
      <a href="#/cours/${esc(course.slug)}/lecon/${esc(l.id)}">
        <span class="num">${i + 1}</span>
        <span class="lesson-title">${esc(l.title)}</span>
        ${!compact && youtubeId(l.youtube_url) ? '<span class="badge">▶ vidéo</span>' : ''}
        ${!compact && l.format === 'html' ? '<span class="badge">HTML</span>' : ''}
        <span class="check" aria-hidden="true">✓</span>
      </a></li>`).join('')}</ol>`;
}

function progressHtml(course, small = false) {
  const n = course.lessons.length, done = Progress.count(course);
  const pct = n ? Math.round((done / n) * 100) : 0;
  return `<div class="progress ${small ? 'small' : ''}"><div class="bar" style="width:${pct}%"></div></div>
    ${small ? '' : `<p class="muted progress-label">${n ? `${done} / ${n} leçons terminées (${pct} %)` : ''}</p>`}`;
}

function coursePage(course) {
  document.title = `${course.title} · Mes cours`;
  const done = Progress.get(course.id);
  const nextLesson = course.lessons.find(l => !done.has(l.id));
  const started = course.lessons.some(l => done.has(l.id));
  const target = nextLesson || course.lessons[0];
  return `
  <div class="course-header">
    ${coverHtml(course)}
    <div>
      ${course.category ? `<span class="tag">${esc(course.category)}</span>` : ''}
      <h1>${esc(course.title)}</h1>
      <div class="prose">${md(course.description)}</div>
      ${progressHtml(course)}
      ${target ? `<a class="btn" href="#/cours/${esc(course.slug)}/lecon/${esc(target.id)}">${
        !started ? 'Commencer le cours' : nextLesson ? 'Reprendre le cours' : 'Revoir le cours ✓'}</a>` : ''}
    </div>
  </div>
  <h2>Programme</h2>
  ${course.lessons.length ? lessonListHtml(course) : '<p class="muted">Aucune leçon pour l\'instant.</p>'}`;
}

// ---------- Page leçon ----------
function lessonPage(course, lessonId) {
  const index = course.lessons.findIndex(l => l.id === lessonId);
  if (index === -1) return notFound("Cette leçon n'existe pas.");
  const lesson = course.lessons[index];
  const prev = course.lessons[index - 1], next = course.lessons[index + 1];
  const isDone = Progress.get(course.id).has(lesson.id);
  const link = l => `#/cours/${esc(course.slug)}/lecon/${esc(l.id)}`;
  document.title = `${lesson.title} · ${course.title}`;
  return `
  <div class="lesson-layout">
    <aside class="sidebar">
      <a href="#/cours/${esc(course.slug)}" class="back">← ${esc(course.title)}</a>
      ${progressHtml(course, true)}
      ${lessonListHtml(course, lesson.id, true)}
    </aside>
    <article class="lesson">
      <p class="muted">Leçon ${index + 1} / ${course.lessons.length}</p>
      <h1>${esc(lesson.title)}</h1>
      ${videoHtml(lesson.youtube_url, lesson.title)}
      ${lessonBodyHtml(lesson)}
      <div class="lesson-actions">
        <button class="btn ghost ${isDone ? 'success' : ''}" type="button" data-toggle-done>
          ${isDone ? '✓ Terminée' : 'Marquer comme terminée'}</button>
      </div>
      <nav class="pager">
        ${prev ? `<a class="btn ghost" data-prev href="${link(prev)}">← ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="btn" data-next href="${link(next)}">${esc(next.title)} →</a>`
               : `<a class="btn" data-next href="#/cours/${esc(course.slug)}">Terminer le cours 🎉</a>`}
      </nav>
    </article>
  </div>`;
}

// ---------- Routeur ----------
let current = {};
function render() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const parts = (path || '/').split('/').filter(Boolean).map(decodeURIComponent);
  current = {};
  let html;
  if (!parts.length) html = home(params);
  else if (parts[0] === 'cours') {
    const course = data.courses.find(c => c.slug === parts[1] && c.published);
    if (!course) html = notFound("Ce cours n'existe pas.");
    else if (parts[2] === 'lecon') { current = { course, lessonId: parts[3] }; html = lessonPage(course, parts[3]); }
    else html = coursePage(course);
  } else html = notFound("Cette page n'existe pas.");
  app.innerHTML = html;
}

app.addEventListener('submit', e => {
  if (e.target.id !== 'search') return;
  e.preventDefault();
  const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
  location.hash = `#/${p.toString() ? `?${p}` : ''}`;
});
app.addEventListener('change', e => { if (e.target.name === 'categorie') e.target.form.requestSubmit(); });
app.addEventListener('click', e => {
  const { course, lessonId } = current;
  if (!course) return;
  if (e.target.closest('[data-toggle-done]')) {
    const on = Progress.toggle(course.id, lessonId);
    const btn = e.target.closest('[data-toggle-done]');
    btn.textContent = on ? '✓ Terminée' : 'Marquer comme terminée';
    btn.classList.toggle('success', on);
    // Met à jour la barre latérale sans toucher à la vidéo
    const aside = app.querySelector('.sidebar');
    aside.innerHTML = `<a href="#/cours/${esc(course.slug)}" class="back">← ${esc(course.title)}</a>
      ${progressHtml(course, true)}${lessonListHtml(course, lessonId, true)}`;
  }
  if (e.target.closest('[data-next]')) Progress.toggle(course.id, lessonId, true);
});
document.addEventListener('keydown', e => {
  if (!current.lessonId || e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') app.querySelector('[data-next]')?.click();
  if (e.key === 'ArrowLeft') app.querySelector('[data-prev]')?.click();
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

try {
  data = await loadData();
  render();
} catch (err) {
  app.innerHTML = `<div class="empty"><h1>Erreur</h1><p>${esc(err.message)}</p></div>`;
}
