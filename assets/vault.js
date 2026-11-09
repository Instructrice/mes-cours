// =====================================================================
// Coffre chiffré du jeton GitHub de l'admin
// ---------------------------------------------------------------------
// Le jeton n'est JAMAIS stocké en clair : il est chiffré avec une clé dérivée
// du mot de passe admin (PBKDF2-SHA256, 600 000 itérations -> AES-256-GCM).
// Le coffre peut donc être publié dans le dépôt public sans danger tant que
// le mot de passe est long et unique. Sans le mot de passe, impossible
// d'obtenir le jeton, donc impossible de modifier les cours.
// =====================================================================

export const VAULT_PATH = 'data/admin-vault.json';
export const MIN_PASSWORD_LENGTH = 12;
export const ITERATIONS = 600_000;           // recommandation OWASP 2023 pour PBKDF2-SHA256
const MIN_ITERATIONS = 600_000;              // refuse un coffre « affaibli » (attaque par rétrogradation)
const MAX_ITERATIONS = 10_000_000;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_RE = /^[A-Za-z0-9_./-]{1,200}$/;
const TOKEN_RE = /^[A-Za-z0-9_]{20,255}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export class VaultError extends Error {}

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new VaultError('Chiffrement indisponible : ouvrez l\'admin en HTTPS dans un navigateur récent.');
  return globalThis.crypto.subtle;
};
const toB64 = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const random = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

// Les champs en clair (dépôt, branche) sont liés au chiffré : les modifier rend le coffre invalide.
const aad = v => enc.encode(`mes-cours-vault:v1:${v.owner}/${v.repo}@${v.branch}`);

async function deriveKey(password, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Renvoie un message d'erreur si le mot de passe est trop faible, sinon ''. */
export function checkPassword(pw) {
  pw = String(pw || '');
  if (pw.length < MIN_PASSWORD_LENGTH) return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  if (/^(.)\1+$/.test(pw)) return 'Le mot de passe ne peut pas répéter un seul caractère.';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length;
  if (pw.length < 20 && classes < 3)
    return 'Mélangez au moins 3 types de caractères (minuscules, majuscules, chiffres, symboles), ou utilisez une phrase de 20 caractères ou plus.';
  return '';
}

function checkConfig({ owner, repo, branch, token }) {
  if (!NAME_RE.test(owner || '')) throw new VaultError('Nom du compte GitHub invalide.');
  if (!NAME_RE.test(repo || '')) throw new VaultError('Nom du dépôt invalide.');
  if (!BRANCH_RE.test(branch || '') || branch.includes('..')) throw new VaultError('Nom de branche invalide.');
  if (!TOKEN_RE.test(token || '')) throw new VaultError('Jeton GitHub invalide (attendu : github_pat_…).');
}

/** Vérifie strictement la forme d'un coffre (venant du dépôt ou du navigateur). */
export function parseVault(obj) {
  const bad = msg => { throw new VaultError(`Coffre invalide : ${msg}`); };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) bad('format');
  if (obj.v !== 1 || obj.kdf !== 'PBKDF2-SHA256' || obj.cipher !== 'AES-256-GCM') bad('version');
  if (!Number.isInteger(obj.iterations) || obj.iterations < MIN_ITERATIONS || obj.iterations > MAX_ITERATIONS) bad('itérations');
  for (const k of ['owner', 'repo']) if (typeof obj[k] !== 'string' || !NAME_RE.test(obj[k])) bad(k);
  if (typeof obj.branch !== 'string' || !BRANCH_RE.test(obj.branch) || obj.branch.includes('..')) bad('branche');
  for (const k of ['salt', 'iv', 'ct']) if (typeof obj[k] !== 'string' || !B64_RE.test(obj[k]) || obj[k].length > 8192) bad(k);
  const salt = fromB64(obj.salt), iv = fromB64(obj.iv), ct = fromB64(obj.ct);
  if (salt.length !== 16 || iv.length !== 12 || ct.length < 17) bad('taille');
  return { v: 1, kdf: obj.kdf, cipher: obj.cipher, iterations: obj.iterations,
    owner: obj.owner, repo: obj.repo, branch: obj.branch, salt: obj.salt, iv: obj.iv, ct: obj.ct };
}

/** Chiffre la configuration GitHub avec le mot de passe. */
export async function createVault(cfg, password) {
  const err = checkPassword(password);
  if (err) throw new VaultError(err);
  const { owner, repo, branch, token } = cfg;
  checkConfig(cfg);
  const salt = random(16), iv = random(12);
  const key = await deriveKey(password, salt, ITERATIONS);
  const meta = { owner, repo, branch };
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(meta) }, key,
    enc.encode(JSON.stringify({ token }))));
  return { v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations: ITERATIONS,
    ...meta, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

/** Déchiffre le coffre. Lève VaultError si le mot de passe est faux ou le coffre altéré. */
export async function openVault(vault, password) {
  const v = parseVault(vault);
  const key = await deriveKey(password, fromB64(v.salt), v.iterations);
  let plain;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(v.iv), additionalData: aad(v) }, key, fromB64(v.ct));
  } catch {
    throw new VaultError('Mot de passe incorrect.');
  }
  let token;
  try { ({ token } = JSON.parse(dec.decode(plain))); } catch { throw new VaultError('Coffre illisible.'); }
  const cfg = { owner: v.owner, repo: v.repo, branch: v.branch, token };
  checkConfig(cfg);
  return cfg;
}
