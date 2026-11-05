// ===== Thème clair / sombre =====
(() => {
  const root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
  if (saved) root.dataset.theme = saved;
  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch {}
  });
})();

// ===== Progression (stockée dans le navigateur) =====
const Progress = {
  key: id => `progress:${id}`,
  get(courseId) {
    try { return new Set(JSON.parse(localStorage.getItem(this.key(courseId)) || '[]')); }
    catch { return new Set(); }
  },
  save(courseId, set) {
    try { localStorage.setItem(this.key(courseId), JSON.stringify([...set])); } catch {}
  },
  toggle(courseId, lessonId, force) {
    const set = this.get(courseId);
    const on = force ?? !set.has(lessonId);
    on ? set.add(lessonId) : set.delete(lessonId);
    this.save(courseId, set);
    return on;
  },
};

function renderProgress() {
  document.querySelectorAll('[data-lesson]').forEach(li => {
    li.classList.toggle('done', Progress.get(li.dataset.course).has(li.dataset.lesson));
  });
  document.querySelectorAll('[data-course-progress]').forEach(el => {
    const id = el.dataset.courseProgress;
    const total = +el.dataset.total || 0;
    const ids = [...document.querySelectorAll(`[data-lesson][data-course="${id}"]`)].map(li => li.dataset.lesson);
    const done = [...Progress.get(id)].filter(x => ids.includes(x)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    el.querySelector('.bar').style.width = pct + '%';
    const label = document.querySelector(`[data-progress-label="${id}"]`);
    if (label) label.textContent = total ? `${done} / ${total} leçons terminées (${pct} %)` : '';
  });
  // Cartes de la page d'accueil (on ne connaît que le total)
  document.querySelectorAll('[data-course-card]').forEach(card => {
    const total = +card.dataset.total || 0;
    const done = Math.min(Progress.get(card.dataset.courseCard).size, total);
    const bar = card.querySelector('.bar');
    if (bar) bar.style.width = (total ? (done / total) * 100 : 0) + '%';
    card.classList.toggle('started', done > 0);
  });
  // Bouton "Reprendre"
  document.querySelectorAll('[data-resume]').forEach(btn => {
    const done = Progress.get(btn.dataset.resume);
    const ids = btn.dataset.ids.split(',');
    if (!done.size) return;
    const nextId = ids.find(id => !done.has(id));
    if (nextId) { btn.textContent = 'Reprendre le cours'; btn.href = `/cours/${btn.dataset.slug}/lecon/${nextId}`; }
    else btn.textContent = 'Revoir le cours ✓';
  });
  document.querySelectorAll('[data-toggle-done]').forEach(btn => {
    const on = Progress.get(btn.dataset.course).has(btn.dataset.toggleDone);
    btn.textContent = on ? '✓ Terminée' : 'Marquer comme terminée';
    btn.classList.toggle('success', on);
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-toggle-done]');
  if (btn) { Progress.toggle(btn.dataset.course, btn.dataset.toggleDone); renderProgress(); }
  // Passer à la leçon suivante la marque comme terminée
  const next = e.target.closest('[data-next]');
  const lesson = document.querySelector('[data-current-lesson]');
  if (next && lesson) Progress.toggle(lesson.dataset.course, lesson.dataset.currentLesson, true);
});
renderProgress();

// Raccourcis clavier sur une leçon : ← / →
document.addEventListener('keydown', e => {
  if (!document.querySelector('[data-current-lesson]') || e.target.closest('input, textarea')) return;
  const pager = document.querySelectorAll('.pager a');
  if (e.key === 'ArrowRight' && pager.length) pager[pager.length - 1].click();
  if (e.key === 'ArrowLeft' && pager.length > 1) pager[0].click();
});

// ===== Confirmation avant suppression =====
document.querySelectorAll('form[data-confirm]').forEach(f =>
  f.addEventListener('submit', e => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));

// ===== Admin : aperçu YouTube en direct =====
function ytId(s) {
  s = (s || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live|v)\/)([\w-]{11})/);
  return m ? m[1] : null;
}
const ytInput = document.querySelector('[data-yt-input]');
const ytPreview = document.querySelector('[data-yt-preview]');
if (ytInput && ytPreview) {
  let current = null;
  const update = () => {
    const id = ytId(ytInput.value);
    ytInput.setCustomValidity(ytInput.value.trim() && !id ? 'Lien YouTube non reconnu' : '');
    if (id === current) return;
    current = id;
    ytPreview.hidden = !id;
    ytPreview.innerHTML = id
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Aperçu" allowfullscreen></iframe>`
      : '';
  };
  ytInput.addEventListener('input', update);
  update();
}

// ===== Admin : aperçu Markdown =====
const mdInput = document.querySelector('[data-md-input]');
const mdPreview = document.querySelector('[data-md-preview]');
if (mdInput && mdPreview && window.marked) {
  const render = () => { mdPreview.innerHTML = marked.parse(mdInput.value || '*Rien à afficher.*'); };
  mdInput.addEventListener('input', render);
  render();
}
