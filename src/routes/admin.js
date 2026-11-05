import { Router } from 'express';
import { Courses, Lessons } from '../db.js';
import { checkPassword, requireAdmin } from '../auth.js';
import { youtubeId } from '../youtube.js';

const router = Router();

// ---------- Connexion ----------
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Connexion admin', error: null, next: req.query.next || '/admin' });
});

router.post('/login', (req, res) => {
  const next = String(req.body.next || '/admin');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  if (!checkPassword(req.body.password || '')) {
    return res.status(401).render('admin/login', {
      title: 'Connexion admin', next: safeNext,
      error: process.env.ADMIN_PASSWORD ? 'Mot de passe incorrect.' : 'ADMIN_PASSWORD n\'est pas défini dans .env',
    });
  }
  req.session.regenerate(() => {
    req.session.isAdmin = true;
    res.redirect(safeNext);
  });
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

router.use(requireAdmin);

// ---------- Helpers ----------
const flash = (req, msg) => { req.session.flash = msg; };

function courseInput(body) {
  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    cover_url: String(body.cover_url || '').trim(),
    published: body.published === 'on',
  };
}

function lessonInput(body) {
  return {
    title: String(body.title || '').trim(),
    youtube_url: String(body.youtube_url || '').trim(),
    content: String(body.content || ''),
  };
}

function validateLesson(input) {
  if (!input.title) return 'Le titre est obligatoire.';
  if (input.youtube_url && !youtubeId(input.youtube_url)) return 'Lien YouTube non reconnu.';
  return null;
}

function getCourseOr404(req, res) {
  const course = Courses.get(Number(req.params.id));
  if (!course) res.status(404).render('error', { title: 'Introuvable', message: 'Cours introuvable.' });
  return course;
}

// ---------- Tableau de bord ----------
router.get('/', (req, res) => {
  res.render('admin/dashboard', { title: 'Administration', courses: Courses.all() });
});

// ---------- Cours ----------
router.get('/cours/nouveau', (req, res) => {
  res.render('admin/course-form', { title: 'Nouveau cours', course: {}, error: null, categories: Courses.categories() });
});

router.post('/cours', (req, res) => {
  const input = courseInput(req.body);
  if (!input.title) {
    return res.status(400).render('admin/course-form', {
      title: 'Nouveau cours', course: input, error: 'Le titre est obligatoire.', categories: Courses.categories(),
    });
  }
  const id = Courses.create(input);
  flash(req, 'Cours créé. Ajoutez maintenant vos leçons !');
  res.redirect(`/admin/cours/${id}`);
});

router.get('/cours/:id', (req, res) => {
  const course = getCourseOr404(req, res);
  if (!course) return;
  res.render('admin/course-edit', {
    title: course.title, course, lessons: Lessons.forCourse(course.id), error: null,
    categories: Courses.categories(),
  });
});

router.post('/cours/:id', (req, res) => {
  const course = getCourseOr404(req, res);
  if (!course) return;
  const input = courseInput(req.body);
  if (!input.title) {
    return res.status(400).render('admin/course-edit', {
      title: course.title, course: { ...course, ...input }, lessons: Lessons.forCourse(course.id),
      error: 'Le titre est obligatoire.', categories: Courses.categories(),
    });
  }
  Courses.update(course.id, input);
  flash(req, 'Cours enregistré.');
  res.redirect(`/admin/cours/${course.id}`);
});

router.post('/cours/:id/supprimer', (req, res) => {
  Courses.remove(Number(req.params.id));
  flash(req, 'Cours supprimé.');
  res.redirect('/admin');
});

// ---------- Leçons ----------
router.get('/cours/:id/lecons/nouvelle', (req, res) => {
  const course = getCourseOr404(req, res);
  if (!course) return;
  res.render('admin/lesson-form', { title: 'Nouvelle leçon', course, lesson: {}, error: null });
});

router.post('/cours/:id/lecons', (req, res) => {
  const course = getCourseOr404(req, res);
  if (!course) return;
  const input = lessonInput(req.body);
  const error = validateLesson(input);
  if (error) {
    return res.status(400).render('admin/lesson-form', { title: 'Nouvelle leçon', course, lesson: input, error });
  }
  Lessons.create(course.id, input);
  flash(req, 'Leçon ajoutée.');
  res.redirect(req.body.again ? `/admin/cours/${course.id}/lecons/nouvelle` : `/admin/cours/${course.id}`);
});

function getLessonOr404(req, res) {
  const lesson = Lessons.get(Number(req.params.id));
  if (!lesson) res.status(404).render('error', { title: 'Introuvable', message: 'Leçon introuvable.' });
  return lesson;
}

router.get('/lecons/:id', (req, res) => {
  const lesson = getLessonOr404(req, res);
  if (!lesson) return;
  res.render('admin/lesson-form', {
    title: lesson.title, course: Courses.get(lesson.course_id), lesson, error: null,
  });
});

router.post('/lecons/:id', (req, res) => {
  const lesson = getLessonOr404(req, res);
  if (!lesson) return;
  const input = lessonInput(req.body);
  const error = validateLesson(input);
  if (error) {
    return res.status(400).render('admin/lesson-form', {
      title: lesson.title, course: Courses.get(lesson.course_id), lesson: { ...lesson, ...input }, error,
    });
  }
  Lessons.update(lesson.id, input);
  flash(req, 'Leçon enregistrée.');
  res.redirect(`/admin/cours/${lesson.course_id}`);
});

router.post('/lecons/:id/deplacer', (req, res) => {
  const lesson = getLessonOr404(req, res);
  if (!lesson) return;
  Lessons.move(lesson.id, req.body.dir === 'up' ? -1 : 1);
  res.redirect(`/admin/cours/${lesson.course_id}#lecons`);
});

router.post('/lecons/:id/supprimer', (req, res) => {
  const lesson = getLessonOr404(req, res);
  if (!lesson) return;
  Lessons.remove(lesson.id);
  flash(req, 'Leçon supprimée.');
  res.redirect(`/admin/cours/${lesson.course_id}#lecons`);
});

export default router;
