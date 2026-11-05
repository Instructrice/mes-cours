import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || 'data/cours.db';
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT '',
    cover_url   TEXT NOT NULL DEFAULT '',
    published   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    youtube_url TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
`);

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cours';
}

function uniqueSlug(title, excludeId = 0) {
  const base = slugify(title);
  let slug = base, i = 2;
  const stmt = db.prepare('SELECT id FROM courses WHERE slug = ? AND id != ?');
  while (stmt.get(slug, excludeId)) slug = `${base}-${i++}`;
  return slug;
}

// ---------- Cours ----------
const COURSE_LIST_SQL = `
  SELECT c.*, COUNT(l.id) AS lesson_count,
         (SELECT youtube_url FROM lessons WHERE course_id = c.id AND youtube_url != ''
          ORDER BY position LIMIT 1) AS first_video
  FROM courses c LEFT JOIN lessons l ON l.course_id = c.id`;

export const Courses = {
  all() {
    return db.prepare(`${COURSE_LIST_SQL} GROUP BY c.id ORDER BY c.updated_at DESC`).all();
  },
  published({ q = '', category = '' } = {}) {
    const like = `%${q}%`;
    return db.prepare(`${COURSE_LIST_SQL}
      WHERE c.published = 1
        AND (? = '' OR c.title LIKE ? OR c.description LIKE ?)
        AND (? = '' OR c.category = ?)
      GROUP BY c.id ORDER BY c.updated_at DESC`).all(q, like, like, category, category);
  },
  categories() {
    return db.prepare(`SELECT DISTINCT category FROM courses
      WHERE published = 1 AND category != '' ORDER BY category`).all().map(r => r.category);
  },
  get(id) { return db.prepare('SELECT * FROM courses WHERE id = ?').get(id); },
  bySlug(slug) { return db.prepare('SELECT * FROM courses WHERE slug = ?').get(slug); },
  create({ title, description = '', category = '', cover_url = '', published = 0 }) {
    const { lastInsertRowid } = db.prepare(`INSERT INTO courses
      (title, slug, description, category, cover_url, published) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(title, uniqueSlug(title), description, category, cover_url, published ? 1 : 0);
    return Number(lastInsertRowid);
  },
  update(id, { title, description = '', category = '', cover_url = '', published = 0 }) {
    db.prepare(`UPDATE courses SET title = ?, slug = ?, description = ?, category = ?,
      cover_url = ?, published = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(title, uniqueSlug(title, id), description, category, cover_url, published ? 1 : 0, id);
  },
  touch(id) { db.prepare("UPDATE courses SET updated_at = datetime('now') WHERE id = ?").run(id); },
  remove(id) { db.prepare('DELETE FROM courses WHERE id = ?').run(id); },
};

// ---------- Leçons ----------
export const Lessons = {
  forCourse(courseId) {
    return db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position, id').all(courseId);
  },
  get(id) { return db.prepare('SELECT * FROM lessons WHERE id = ?').get(id); },
  create(courseId, { title, youtube_url = '', content = '' }) {
    const { next } = db.prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM lessons WHERE course_id = ?').get(courseId);
    const { lastInsertRowid } = db.prepare(`INSERT INTO lessons
      (course_id, title, youtube_url, content, position) VALUES (?, ?, ?, ?, ?)`)
      .run(courseId, title, youtube_url, content, next);
    Courses.touch(courseId);
    return Number(lastInsertRowid);
  },
  update(id, { title, youtube_url = '', content = '' }) {
    db.prepare('UPDATE lessons SET title = ?, youtube_url = ?, content = ? WHERE id = ?')
      .run(title, youtube_url, content, id);
    const l = this.get(id);
    if (l) Courses.touch(l.course_id);
  },
  remove(id) { db.prepare('DELETE FROM lessons WHERE id = ?').run(id); },
  /** Déplace une leçon d'un cran vers le haut (-1) ou le bas (+1). */
  move(id, delta) {
    const lesson = this.get(id);
    if (!lesson) return;
    const list = this.forCourse(lesson.course_id);
    const i = list.findIndex(l => l.id === lesson.id);
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const upd = db.prepare('UPDATE lessons SET position = ? WHERE id = ?');
    db.exec('BEGIN');
    try { list.forEach((l, pos) => upd.run(pos, l.id)); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};
