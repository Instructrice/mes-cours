import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { youtubeId } from '../assets/youtube.js';

test('data/courses.json est valide', () => {
  const { courses } = JSON.parse(readFileSync(new URL('../data/courses.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(courses));
  const slugs = new Set();
  for (const c of courses) {
    assert.ok(c.id && c.title && c.slug, `cours incomplet : ${JSON.stringify(c.title)}`);
    assert.ok(!slugs.has(c.slug), `slug en double : ${c.slug}`);
    slugs.add(c.slug);
    assert.ok(Array.isArray(c.lessons));
    for (const l of c.lessons) {
      assert.ok(l.id && l.title, `leçon incomplète dans ${c.title}`);
      if (l.youtube_url) assert.ok(youtubeId(l.youtube_url), `lien YouTube invalide : ${l.youtube_url}`);
    }
  }
});

test('le format des leçons est connu', () => {
  const { courses } = JSON.parse(readFileSync(new URL('../data/courses.json', import.meta.url), 'utf8'));
  for (const c of courses) for (const l of c.lessons)
    assert.ok(!l.format || ['markdown', 'html'].includes(l.format), `format inconnu : ${l.format}`);
});
