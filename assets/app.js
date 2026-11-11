import { esc, md, plain, coverHtml, loadData, Progress, initTheme, videoHtml, youtubeId, lessonBodyHtml } from './common.js';

initTheme();
const app = document.getElementById('app');
let data;

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// ----- Une couleur par catégorie -----
const CATEGORY_COLORS = {
  'bts sio sisr': '#3b6fd8',
  'admin sys': '#7a4fd0',
  'conduite': '#23855a',
  'maths': '#c9453f',
};
const FALLBACK_COLORS = ['#0e7c8a', '#a8680f', '#b0407a', '#4a6b8a', '#5b7a1e', '#8a4fb0'];
function catColor(category) {
  const key = String(category || '').trim().toLowerCase();
  if (CATEGORY_COLORS[key]) return CATEGORY_COLORS[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}
/** Attribut style qui donne sa couleur à un élément « .cat ». */
const catStyle = category => `style="--cat:${catColor(category)}"`;
const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEARCH = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13.5 13.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const notFound = msg => `<div class="empty"><h1>Page introuvable</h1>
  <p>${esc(msg)}</p><p><a class="btn" href="#/">Retour aux cours</a></p></div>`;

function progressHtml(course, small = false) {
  const n = course.lessons.length, done = Progress.count(course);
  if (!n) return '';
  const pct = Math.round((done / n) * 100);
  return `<div class="progress ${small ? 'small' : ''}"><div class="bar" style="width:${pct}%"></div></div>
    <p class="progress-label">${done ? `${done} sur ${plural(n, 'leçon')} terminée${done > 1 ? 's' : ''}` : 'Pas encore commencé'}</p>`;
}

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

  const chipHref = c => {
    const p = new URLSearchParams();
    if (params.get('q')) p.set('q', params.get('q'));
    if (c) p.set('categorie', c);
    return `#/${p.toString() ? `?${p}` : ''}`;
  };

  // Cours commencé mais pas terminé : mis en avant en haut de page
  const inProgress = !q && !cat && published.find(c => {
    const d = Progress.count(c);
    return d > 0 && d < c.lessons.length;
  });
  let resume = '';
  if (inProgress) {
    const done = Progress.get(inProgress.id);
    const next = inProgress.lessons.find(l => !done.has(l.id));
    resume = `<a class="resume cat" ${catStyle(inProgress.category)} href="#/cours/${esc(inProgress.slug)}/lecon/${esc(next.id)}">
      ${coverHtml(inProgress)}
      <div class="resume-body">
        <p class="eyebrow">Reprendre où vous en étiez</p>
        <h2>${esc(inProgress.title)}</h2>
        ${progressHtml(inProgress, true)}
      </div>
      <span class="btn">Continuer</span>
    </a>`;
  }

  return `
  <section class="hero">
    <h1>Apprendre,<br>à votre rythme</h1>
    <p class="lead">Des cours clairs, des vidéos et des fiches pour progresser sereinement. Votre avancement est enregistré au fil des leçons.</p>
    <form class="search" id="search" role="search">
      ${SEARCH}
      <input type="search" name="q" value="${esc(params.get('q') || '')}" placeholder="Rechercher un cours ou un sujet" aria-label="Rechercher un cours">
      ${cat ? `<input type="hidden" name="categorie" value="${esc(cat)}">` : ''}
      <button class="btn">Rechercher</button>
    </form>
  </section>
  ${resume}
  ${categories.length > 1 ? `<nav class="subjects ${cat ? 'filtering' : ''}" aria-label="Matières">
    ${categories.map(c => {
      const count = published.filter(x => x.category === c).length;
      return `<a class="subject cat ${c === cat ? 'on' : ''}" ${catStyle(c)} href="${esc(chipHref(c === cat ? '' : c))}"
        ${c === cat ? 'aria-current="true"' : ''}><strong>${esc(c)}</strong><span>${count} cours</span></a>`;
    }).join('')}
  </nav>` : ''}
  <div class="section-head">
    <h2>${cat ? esc(cat) : 'Tous les cours'}</h2>
    ${cat ? `<a href="${chipHref('')}">Voir toutes les matières</a>` : ''}
  </div>
  ${q ? `<p class="result-line">${plural(list.length, 'résultat')} pour « ${esc(params.get('q'))} » · <a href="${chipHref(cat)}">effacer</a></p>` : ''}
  ${!list.length ? `<div class="empty">${q || cat
      ? '<p>Aucun cours ne correspond à votre recherche.</p><p><a class="btn ghost" href="#/">Voir tous les cours</a></p>'
      : '<p>Aucun cours publié pour l\'instant.</p><p><a class="btn" href="admin.html">Créer mon premier cours</a></p>'}</div>` : ''}
  <div class="grid">
    ${list.map(c => {
      const n = c.lessons.length, done = Progress.count(c);
      return `<a class="card cat ${done ? 'started' : ''}" ${catStyle(c.category)} href="#/cours/${esc(c.slug)}">
        ${coverHtml(c)}
        <div class="band"><span>${esc(c.category || 'Cours')}</span><span>${plural(n, 'leçon')}</span></div>
        <div class="card-body">
          <h2>${esc(c.title)}</h2>
          <p class="muted clamp">${esc(plain(c.description))}</p>
          <div class="card-foot">
            ${done ? `<span>${done === n ? 'Terminé' : 'En cours'}</span>` : ''}
            <div class="progress small"><div class="bar" style="width:${n ? (done / n) * 100 : 0}%"></div></div>
            ${done ? '' : '<span class="more">Découvrir</span>'}
          </div>
        </div></a>`;
    }).join('')}
  </div>`;
}

// ---------- Page cours ----------
function lessonListHtml(course, currentId, compact = false) {
  const done = Progress.get(course.id);
  return `<ol class="lesson-list ${compact ? 'compact' : ''}">${course.lessons.map(l => `
    <li class="${done.has(l.id) ? 'done' : ''} ${l.id === currentId ? 'current' : ''}">
      <a href="#/cours/${esc(course.slug)}/lecon/${esc(l.id)}" ${l.id === currentId ? 'aria-current="page"' : ''}>
        <span class="mark" title="${done.has(l.id) ? 'Terminée' : 'À faire'}">${CHECK}</span>
        <span class="lesson-title">${esc(l.title)}</span>
        ${!compact && youtubeId(l.youtube_url) ? '<span class="badge">Vidéo</span>' : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </a></li>`).join('')}</ol>`;
}

function coursePage(course) {
  document.title = `${course.title} · Mes cours`;
  const done = Progress.get(course.id);
  const nextLesson = course.lessons.find(l => !done.has(l.id));
  const started = course.lessons.some(l => done.has(l.id));
  const target = nextLesson || course.lessons[0];
  const n = course.lessons.length;
  return `<div class="cat" ${catStyle(course.category)}>
  <a class="back" href="#/">← Tous les cours</a>
  <div class="course-header">
    <div>
      ${course.category ? `<p class="eyebrow">${esc(course.category)}</p>` : ''}
      <h1>${esc(course.title)}</h1>
      <div class="prose">${md(course.description)}</div>
      ${progressHtml(course)}
      ${target ? `<a class="btn" href="#/cours/${esc(course.slug)}/lecon/${esc(target.id)}">${
        !started ? 'Commencer le cours' : nextLesson ? 'Reprendre le cours' : 'Revoir le cours'}</a>` : ''}
    </div>
    ${coverHtml(course)}
  </div>
  <section class="programme">
    <h2>Programme du cours</h2>
    <p>${plural(n, 'leçon')} à suivre dans l'ordre ou selon vos besoins.</p>
    ${n ? lessonListHtml(course) : '<p class="muted">Aucune leçon pour l\'instant.</p>'}
  </section></div>`;
}

// ---------- Page leçon ----------
const sidebarHtml = (course, lessonId) => `
  <a href="#/cours/${esc(course.slug)}" class="back">${esc(course.title)}</a>
  ${progressHtml(course, true)}
  ${lessonListHtml(course, lessonId, true)}`;

function lessonPage(course, lessonId) {
  const index = course.lessons.findIndex(l => l.id === lessonId);
  if (index === -1) return notFound("Cette leçon n'existe pas.");
  const lesson = course.lessons[index];
  const prev = course.lessons[index - 1], next = course.lessons[index + 1];
  const isDone = Progress.get(course.id).has(lesson.id);
  const link = l => `#/cours/${esc(course.slug)}/lecon/${esc(l.id)}`;
  document.title = `${lesson.title} · ${course.title}`;
  return `
  <div class="lesson-layout cat" ${catStyle(course.category)}>
    <aside class="sidebar">${sidebarHtml(course, lesson.id)}</aside>
    <article class="lesson">
      ${course.category ? `<p class="eyebrow">${esc(course.category)}</p>` : ''}
      <h1>${esc(lesson.title)}</h1>
      ${videoHtml(lesson.youtube_url, lesson.title)}
      ${lessonBodyHtml(lesson)}
      <div class="lesson-actions">
        <button class="btn ghost ${isDone ? 'success' : ''}" type="button" data-toggle-done>
          ${isDone ? '✓ Leçon terminée' : 'Marquer comme terminée'}</button>
      </div>
      <nav class="pager" aria-label="Navigation entre les leçons">
        ${prev ? `<a data-prev href="${link(prev)}"><small>← Leçon précédente</small><strong>${esc(prev.title)}</strong></a>` : ''}
        ${next ? `<a class="next" data-next href="${link(next)}"><small>Leçon suivante →</small><strong>${esc(next.title)}</strong></a>`
               : `<a class="next" data-next href="#/cours/${esc(course.slug)}"><small>Dernière leçon</small><strong>Terminer le cours</strong></a>`}
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
    btn.textContent = on ? '✓ Leçon terminée' : 'Marquer comme terminée';
    btn.classList.toggle('success', on);
    // Met à jour la barre latérale sans toucher à la vidéo
    app.querySelector('.sidebar').innerHTML = sidebarHtml(course, lessonId);
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
