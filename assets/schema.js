// =====================================================================
// Validation stricte des données des cours (data/courses.json)
// ---------------------------------------------------------------------
// Tout ce qui est lu (GitHub, brouillon du navigateur) ou publié passe ici.
// Seuls les champs connus sont recopiés (pas de champ caché, pas de
// __proto__), chaque valeur est typée et bornée, les liens doivent être
// en https:// : une donnée injectée ou altérée est refusée avec un message.
// =====================================================================
import { youtubeId } from './youtube.js';

export class DataError extends Error {}

export const LIMITS = {
  title: 200, category: 100, description: 20_000, url: 2048,
  content: 2_000_000, lessons: 500, courses: 1000,
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FORMATS = ['markdown', 'html'];

const fail = (path, msg) => { throw new DataError(`${path} : ${msg}`); };
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function text(v, max, path, required = false) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') fail(path, 'texte attendu');
  if (v.includes('\u0000')) fail(path, 'caractère interdit');
  if (v.length > max) fail(path, `trop long (${max} caractères max.)`);
  if (required && !v.trim()) fail(path, 'obligatoire');
  return v;
}

function id(v, path) {
  if (typeof v !== 'string' || !ID_RE.test(v)) fail(path, 'identifiant invalide');
  return v;
}

/** Une URL vide ou en https:// (bloque javascript:, data:, http:…). */
export function httpsUrl(v, path = 'URL') {
  v = text(v, LIMITS.url, path).trim();
  if (!v) return '';
  let u;
  try { u = new URL(v); } catch { fail(path, 'adresse invalide'); }
  if (u.protocol !== 'https:') fail(path, 'doit commencer par https://');
  return v;
}

export function validateLesson(l, path = 'Leçon') {
  if (!isObject(l)) fail(path, 'format invalide');
  const youtube_url = text(l.youtube_url, LIMITS.url, `${path} › vidéo`).trim();
  if (youtube_url && !youtubeId(youtube_url)) fail(`${path} › vidéo`, 'lien YouTube non reconnu');
  const format = l.format ?? 'markdown';
  if (!FORMATS.includes(format)) fail(`${path} › format`, 'inconnu');
  return {
    id: id(l.id, `${path} › id`),
    title: text(l.title, LIMITS.title, `${path} › titre`, true).trim(),
    youtube_url,
    content: text(l.content, LIMITS.content, `${path} › contenu`),
    format,
  };
}

export function validateCourse(c, path = 'Cours') {
  if (!isObject(c)) fail(path, 'format invalide');
  const name = typeof c.title === 'string' ? `Cours « ${c.title.slice(0, 40)} »` : path;
  if (!Array.isArray(c.lessons ?? [])) fail(`${name} › leçons`, 'liste attendue');
  const lessons = (c.lessons ?? []);
  if (lessons.length > LIMITS.lessons) fail(name, `trop de leçons (${LIMITS.lessons} max.)`);
  const ids = new Set();
  const clean = lessons.map((l, i) => {
    const lesson = validateLesson(l, `${name} › leçon ${i + 1}`);
    if (ids.has(lesson.id)) fail(`${name} › leçon ${i + 1}`, 'identifiant en double');
    ids.add(lesson.id);
    return lesson;
  });
  if (c.slug !== undefined && (typeof c.slug !== 'string' || c.slug.length > 80 || !SLUG_RE.test(c.slug)))
    fail(`${name} › slug`, 'invalide');
  if (c.updated_at && (typeof c.updated_at !== 'string' || !DATE_RE.test(c.updated_at)))
    fail(`${name} › date`, 'invalide');
  if (c.published !== undefined && typeof c.published !== 'boolean') fail(`${name} › publié`, 'oui/non attendu');
  return {
    id: id(c.id, `${name} › id`),
    title: text(c.title, LIMITS.title, `${name} › titre`, true).trim(),
    category: text(c.category, LIMITS.category, `${name} › catégorie`).trim(),
    description: text(c.description, LIMITS.description, `${name} › description`),
    cover_url: httpsUrl(c.cover_url, `${name} › couverture`),
    published: c.published === true,
    lessons: clean,
    ...(c.updated_at ? { updated_at: c.updated_at } : {}),
    ...(c.slug !== undefined ? { slug: c.slug } : {}),
  };
}

/** Valide tout le fichier ; renvoie une copie propre ou lève DataError. */
export function validateData(data) {
  if (!isObject(data) || !Array.isArray(data.courses)) fail('Données', 'format invalide (attendu : { "courses": [...] })');
  if (data.courses.length > LIMITS.courses) fail('Données', 'trop de cours');
  const ids = new Set(), slugs = new Set();
  const courses = data.courses.map((c, i) => {
    const course = validateCourse(c, `Cours ${i + 1}`);
    if (ids.has(course.id)) fail(`Cours ${i + 1}`, 'identifiant en double');
    if (course.slug && slugs.has(course.slug)) fail(`Cours ${i + 1}`, 'slug en double');
    ids.add(course.id); if (course.slug) slugs.add(course.slug);
    return course;
  });
  return { courses };
}
