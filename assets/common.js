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
