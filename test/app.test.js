import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'secret-test';
const { createApp } = await import('../src/app.js');

let server, base;
before(() => new Promise(r => { server = createApp().listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => server.close());

const form = data => ({ method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: globalThis.cookie || '' },
  body: new URLSearchParams(data) });

test('l\'admin est protégé', async () => {
  const res = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/admin\/login/);
});

test('mauvais mot de passe refusé', async () => {
  const res = await fetch(`${base}/admin/login`, form({ password: 'nope' }));
  assert.equal(res.status, 401);
});

test('parcours complet : créer un cours, une leçon, la visualiser', async () => {
  let res = await fetch(`${base}/admin/login`, form({ password: 'secret-test' }));
  assert.equal(res.status, 302);
  globalThis.cookie = res.headers.get('set-cookie').split(';')[0];

  res = await fetch(`${base}/admin/cours`, form({ title: 'Apprendre le Rust', description: 'Intro', published: 'on' }));
  assert.equal(res.status, 302);
  const courseId = res.headers.get('location').split('/').pop();

  res = await fetch(`${base}/admin/cours/${courseId}/lecons`, form({ title: 'Lien cassé', youtube_url: 'https://vimeo.com/1' }));
  assert.equal(res.status, 400);

  res = await fetch(`${base}/admin/cours/${courseId}/lecons`,
    form({ title: 'Installation', youtube_url: 'https://youtu.be/dQw4w9WgXcQ', content: '# Étape **1**' }));
  assert.equal(res.status, 302);

  const home = await (await fetch(base)).text();
  assert.match(home, /Apprendre le Rust/);

  const course = await (await fetch(`${base}/cours/apprendre-le-rust`)).text();
  const lessonPath = course.match(/href="(\/cours\/apprendre-le-rust\/lecon\/\d+)"/)[1];
  const lesson = await (await fetch(base + lessonPath)).text();
  assert.match(lesson, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(lesson, /<strong>1<\/strong>/);
});

test('un brouillon n\'est pas visible du public', async () => {
  let res = await fetch(`${base}/admin/cours`, form({ title: 'Secret' }));
  assert.equal(res.status, 302);
  res = await fetch(`${base}/cours/secret`);
  assert.equal(res.status, 404);
});
