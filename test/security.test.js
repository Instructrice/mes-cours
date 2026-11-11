import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVault, openVault, parseVault, checkPassword, VaultError, VAULT_PATH } from '../assets/vault.js';
import { validateData, validateCourse, validateLesson, DataError } from '../assets/schema.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const CFG = { owner: 'Instructrice', repo: 'mes-cours', branch: 'main', token: 'github_pat_' + 'A1b2C3d4'.repeat(10) };
const PASSWORD = 'Correct-Cheval-Pile-42';

// ---------------------------------------------------------------- coffre
test('coffre : chiffrement puis déchiffrement avec le bon mot de passe', async () => {
  const vault = await createVault(CFG, PASSWORD);
  assert.ok(!JSON.stringify(vault).includes(CFG.token), 'le jeton ne doit jamais apparaître en clair');
  assert.equal(vault.iterations >= 600_000, true);
  assert.deepEqual(await openVault(vault, PASSWORD), CFG);
});

test('coffre : mauvais mot de passe refusé', async () => {
  const vault = await createVault(CFG, PASSWORD);
  await assert.rejects(openVault(vault, 'Correct-Cheval-Pile-43'), VaultError);
});

test('coffre : toute altération est détectée (chiffré, dépôt, branche)', async () => {
  const vault = await createVault(CFG, PASSWORD);
  const ct = Buffer.from(vault.ct, 'base64'); ct[0] ^= 1;
  await assert.rejects(openVault({ ...vault, ct: ct.toString('base64') }, PASSWORD), VaultError);
  await assert.rejects(openVault({ ...vault, repo: 'autre-depot' }, PASSWORD), VaultError);
  await assert.rejects(openVault({ ...vault, branch: 'pirate' }, PASSWORD), VaultError);
});

test('coffre : refuse un coffre affaibli ou malformé', async () => {
  const vault = await createVault(CFG, PASSWORD);
  assert.throws(() => parseVault({ ...vault, iterations: 1000 }), VaultError);
  assert.throws(() => parseVault({ ...vault, iterations: '600000' }), VaultError);
  assert.throws(() => parseVault({ ...vault, owner: '../evil' }), VaultError);
  assert.throws(() => parseVault({ ...vault, branch: 'a/../b' }), VaultError);
  assert.throws(() => parseVault({ ...vault, salt: 'AAAA' }), VaultError);
  assert.throws(() => parseVault(null), VaultError);
  assert.throws(() => parseVault([]), VaultError);
});

test('mot de passe : les mots de passe faibles sont refusés', () => {
  for (const pw of ['', 'court', 'motdepasse12', 'aaaaaaaaaaaaaaaa', 'abcdefghijkl'])
    assert.ok(checkPassword(pw), `devrait être refusé : ${pw}`);
  for (const pw of [PASSWORD, 'une phrase de passe bien longue'])
    assert.equal(checkPassword(pw), '', `devrait être accepté : ${pw}`);
  return assert.rejects(createVault(CFG, 'faible'), VaultError);
});

// ---------------------------------------------------------------- injections
const lesson = (extra = {}) => ({ id: 'l1', title: 'Leçon', content: '', ...extra });
const course = (extra = {}) => ({ id: 'c1', title: 'Cours', slug: 'cours', lessons: [lesson()], ...extra });

test('données : liens dangereux refusés (javascript:, data:, http:)', () => {
  for (const cover_url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>', 'http://exemple.fr/a.png', 'vbscript:x'])
    assert.throws(() => validateCourse(course({ cover_url })), DataError, cover_url);
  assert.equal(validateCourse(course({ cover_url: 'https://exemple.fr/a.png' })).cover_url, 'https://exemple.fr/a.png');
});

test('données : identifiants et slugs ne peuvent pas contenir de code', () => {
  for (const id of ['"><img src=x onerror=alert(1)>', '../../etc', '', 'a b', 'x'.repeat(65)])
    assert.throws(() => validateCourse(course({ id })), DataError, id);
  for (const slug of ['<script>', 'A-Maj', '-x', 'a--b', '../x'])
    assert.throws(() => validateCourse(course({ slug })), DataError, slug);
  assert.throws(() => validateLesson(lesson({ id: '<svg/onload=alert(1)>' })), DataError);
});

test('données : champs inconnus et pollution de prototype supprimés', () => {
  const evil = JSON.parse('{"courses":[{"id":"c1","title":"T","slug":"t","lessons":[],"__proto__":{"admin":true},"onclick":"x","isAdmin":true}]}');
  const out = validateData(evil);
  assert.deepEqual(Object.keys(out.courses[0]).sort(), ['category', 'cover_url', 'description', 'id', 'lessons', 'published', 'slug', 'title']);
  assert.equal({}.admin, undefined);
  assert.equal(out.courses[0].admin, undefined);
});

test('données : types, tailles et formats contrôlés', () => {
  assert.throws(() => validateData({ courses: 'x' }), DataError);
  assert.throws(() => validateData([]), DataError);
  assert.throws(() => validateCourse(course({ title: { $ne: null } })), DataError);
  assert.throws(() => validateCourse(course({ title: '   ' })), DataError);
  assert.throws(() => validateCourse(course({ title: 'x'.repeat(201) })), DataError);
  assert.throws(() => validateCourse(course({ published: 'true' })), DataError);
  assert.throws(() => validateLesson(lesson({ format: 'php' })), DataError);
  assert.throws(() => validateLesson(lesson({ youtube_url: 'https://evil.example/watch?v=abcdefghijk' })), DataError);
  assert.throws(() => validateLesson(lesson({ title: 'a\u0000b' })), DataError);
  assert.throws(() => validateData({ courses: [course(), course()] }), DataError, 'id en double');
  assert.throws(() => validateCourse(course({ lessons: [lesson(), lesson()] })), DataError, 'leçon en double');
});

test('données : le fichier data/courses.json actuel est accepté', () => {
  const data = JSON.parse(readFileSync(join(root, 'data/courses.json'), 'utf8'));
  const out = validateData(data);
  assert.equal(out.courses.length, data.courses.length);
});

test('coffre publié : s\'il existe, il est bien formé (jamais de jeton en clair)', () => {
  const p = join(root, VAULT_PATH);
  if (!existsSync(p)) return;
  const vault = JSON.parse(readFileSync(p, 'utf8'));
  assert.doesNotThrow(() => parseVault(vault));
  assert.deepEqual(Object.keys(vault).sort(), ['branch', 'cipher', 'ct', 'iterations', 'iv', 'kdf', 'owner', 'repo', 'salt', 'v']);
});

// ---------------------------------------------------------------- fuites de secrets
test('aucun jeton GitHub en clair dans le dépôt', () => {
  const TOKEN_RE = /\b(?:github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,})\b/;
  const walk = dir => readdirSync(dir).flatMap(name => {
    if (['.git', 'node_modules', 'vendor'].includes(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  for (const file of walk(root)) {
    if (file.endsWith('security.test.js')) continue;
    assert.ok(!TOKEN_RE.test(readFileSync(file, 'utf8')), `jeton GitHub trouvé en clair dans ${file}`);
  }
});

// ---------------------------------------------------------------- pages
test('admin et site : politique de sécurité (CSP) stricte, aucun script inline', () => {
  for (const page of ['admin.html', 'index.html']) {
    const html = readFileSync(join(root, page), 'utf8');
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
    assert.match(csp, /script-src 'self'(;|$)/, `${page} : script-src doit être limité à 'self'`);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${page} : script inline interdit`);
  }
  const admin = readFileSync(join(root, 'admin.html'), 'utf8');
  assert.match(admin, /connect-src 'self' https:\/\/api\.github\.com;/);
});

test('admin : le jeton n\'est jamais écrit dans le stockage du navigateur', () => {
  const js = readFileSync(join(root, 'assets/admin.js'), 'utf8');
  assert.ok(!/store\.set\([^)]*token/i.test(js));
  assert.ok(!/localStorage\.setItem\([^)]*token/i.test(js));
  assert.ok(!/sessionStorage/.test(js));
});
