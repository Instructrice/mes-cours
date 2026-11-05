import { timingSafeEqual, createHash } from 'node:crypto';

const hash = s => createHash('sha256').update(String(s)).digest();

export function checkPassword(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(hash(candidate), hash(expected));
}

export function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}
