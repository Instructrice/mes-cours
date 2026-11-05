const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extrait l'identifiant d'une vidéo YouTube depuis une URL (ou un ID brut). */
export function youtubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (ID_RE.test(s)) return s;
  let url;
  try { url = new URL(s.startsWith('http') ? s : `https://${s}`); } catch { return null; }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Temps de départ éventuel (?t=90 ou ?t=1m30s) en secondes. */
export function youtubeStart(input) {
  try {
    const t = new URL(String(input).trim()).searchParams.get('t') || '';
    if (/^\d+s?$/.test(t)) return parseInt(t, 10);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (m && t) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  } catch { /* pas une URL */ }
  return 0;
}

export function embedUrl(input) {
  const id = youtubeId(input);
  if (!id) return null;
  const start = youtubeStart(input);
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}`;
}

export function thumbnailUrl(input) {
  const id = youtubeId(input);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
