import { youtubeId, embedUrl, thumbnailUrl } from './youtube.js';
export { youtubeId, embedUrl, thumbnailUrl };

export const DATA_PATH = 'data/courses.json';

/** Échappe le texte pour l'insérer dans du HTML. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Markdown -> HTML nettoyé. */
export const md = text => window.DOMPurify.sanitize(window.marked.parse(text || ''),
  { ADD_ATTR: ['target'] });

export const plain = text => String(text || '').replace(/[#*_`>\[\]]/g, '');

export function coverOf(course) {
  if (course.cover_url) return course.cover_url;
  const first = (course.lessons || []).find(l => youtubeId(l.youtube_url));
  return first ? thumbnailUrl(first.youtube_url) : null;
}

export function coverHtml(course) {
  const src = coverOf(course);
  return `<div class="cover">${src
    ? `<img src="${esc(src)}" alt="" loading="lazy">`
    : `<span>${esc((course.title || '?').charAt(0).toUpperCase())}</span>`}</div>`;
}

export async function loadData() {
  const res = await fetch(DATA_PATH, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Impossible de charger ${DATA_PATH} (${res.status})`);
  return normalize(await res.json());
}

export function normalize(data) {
  const courses = Array.isArray(data?.courses) ? data.courses : [];
  courses.forEach(c => { c.lessons = Array.isArray(c.lessons) ? c.lessons : []; });
  return { courses };
}

// ----- Progression (dans le navigateur) -----
export const Progress = {
  key: id => `progress:${id}`,
  get(courseId) {
    try { return new Set(JSON.parse(localStorage.getItem(this.key(courseId)) || '[]')); }
    catch { return new Set(); }
  },
  toggle(courseId, lessonId, force) {
    const set = this.get(courseId);
    const on = force ?? !set.has(lessonId);
    on ? set.add(lessonId) : set.delete(lessonId);
    try { localStorage.setItem(this.key(courseId), JSON.stringify([...set])); } catch {}
    return on;
  },
  /** Nombre de leçons du cours terminées. */
  count(course) {
    const done = this.get(course.id);
    return course.lessons.filter(l => done.has(l.id)).length;
  },
};

// ----- Thème clair / sombre -----
export function initTheme() {
  const root = document.documentElement;
  try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch {}
  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch {}
  });
}

export function videoHtml(url, title = '') {
  const src = embedUrl(url);
  if (!src) return '';
  return `<div class="video"><iframe src="${esc(src)}" title="${esc(title)}" loading="lazy"
    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
}

// ----- Leçons au format HTML -----
// Le HTML de la leçon s'affiche dans une iframe "sandbox" sans allow-same-origin :
// ses scripts fonctionnent, mais elle ne peut lire ni les données du site ni le jeton admin.
const HTML_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals';

const HTML_HELPER = `<script>(function(){
  function size(){
    var b=document.body; if(!b) return;
    var h=Math.ceil(Math.max(b.scrollHeight, b.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(b).marginBottom)||0)));
    parent.postMessage({ htmlLessonHeight: h }, '*');
  }
  addEventListener('load', size); addEventListener('resize', size);
  if (window.ResizeObserver) document.addEventListener('DOMContentLoaded', function(){ new ResizeObserver(size).observe(document.body); });
  setTimeout(size, 50); setTimeout(size, 600);
  // Les liens externes s'ouvrent dans un nouvel onglet
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && !a.target && a.getAttribute('href').charAt(0) !== '#') a.target = '_blank';
  }, true);
})();<\/script>`;

const HTML_BASE_STYLE = `<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 4px 2px 16px; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  img, video { max-width: 100%; height: auto; }
  pre { overflow: auto; }
</style>`;

/** Construit le document complet affiché dans l'iframe. */
export function htmlLessonDoc(content) {
  const src = String(content || '');
  const isFullDoc = /<html[\s>]|<body[\s>]|<!doctype/i.test(src);
  if (!isFullDoc) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">${HTML_BASE_STYLE}${HTML_HELPER}</head>
      <body>${src}</body></html>`;
  }
  // Document complet : on garde ses styles et on ajoute juste l'ajustement de hauteur
  if (/<head[^>]*>/i.test(src)) return src.replace(/<head[^>]*>/i, m => `${m}<meta charset="utf-8">${HTML_HELPER}`);
  if (/<html[^>]*>/i.test(src)) return src.replace(/<html[^>]*>/i, m => `${m}<head><meta charset="utf-8">${HTML_HELPER}</head>`);
  return HTML_HELPER + src;
}

export function htmlLessonFrame(content, title = '') {
  return `<iframe class="html-lesson" title="${esc(title)}" sandbox="${HTML_SANDBOX}"
    srcdoc="${esc(htmlLessonDoc(content))}"></iframe>`;
}

/** Contenu d'une leçon selon son format (markdown par défaut). */
export function lessonBodyHtml(lesson) {
  if (!lesson.content) return '';
  return lesson.format === 'html'
    ? htmlLessonFrame(lesson.content, lesson.title)
    : `<div class="prose">${md(lesson.content)}</div>`;
}

// Ajuste la hauteur des iframes HTML à leur contenu
window.addEventListener('message', e => {
  const h = e.data && e.data.htmlLessonHeight;
  if (typeof h !== 'number') return;
  for (const f of document.querySelectorAll('iframe.html-lesson')) {
    if (f.contentWindow === e.source) f.style.height = `${Math.min(Math.max(h, 60), 20000)}px`;
  }
});
