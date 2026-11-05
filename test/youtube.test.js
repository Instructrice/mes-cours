import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, youtubeStart, embedUrl } from '../assets/youtube.js';

test('extrait l\'ID des différents formats', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `youtube.com/watch?v=${id}`,
  ]) assert.equal(youtubeId(url), id, url);
});

test('rejette les liens invalides', () => {
  for (const url of ['', 'https://vimeo.com/123', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'pas un lien'])
    assert.equal(youtubeId(url), null, url);
});

test('gère le temps de départ', () => {
  assert.equal(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=90'), 90);
  assert.equal(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=1m30s'), 90);
  assert.match(embedUrl('https://youtu.be/dQw4w9WgXcQ?t=42'), /start=42/);
});
