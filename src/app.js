import express from 'express';
import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { embedUrl, thumbnailUrl, youtubeId } from './youtube.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', `${root}views`);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(express.static(`${root}public`, { maxAge: '1h' }));
  app.use('/vendor', express.static(`${root}node_modules/marked/lib`));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict', // protège les formulaires admin contre le CSRF
      secure: process.env.NODE_ENV === 'production' && !!process.env.TRUST_PROXY,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }));

  // Variables disponibles dans toutes les vues
  app.use((req, res, next) => {
    res.locals.isAdmin = !!req.session.isAdmin;
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    res.locals.path = req.path;
    res.locals.siteName = process.env.SITE_NAME || 'Mes cours';
    res.locals.md = text => marked.parse(text || '');
    res.locals.embedUrl = embedUrl;
    res.locals.thumbnailUrl = thumbnailUrl;
    res.locals.youtubeId = youtubeId;
    res.locals.coverOf = c => c.cover_url || thumbnailUrl(c.first_video) || null;
    next();
  });

  app.use('/', publicRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas." }));
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue.' });
  });
  return app;
}
