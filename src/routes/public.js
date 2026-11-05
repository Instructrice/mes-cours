import { Router } from 'express';
import { Courses, Lessons } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.categorie || '').trim();
  res.render('home', {
    title: 'Mes cours',
    courses: Courses.published({ q, category }),
    categories: Courses.categories(),
    q, category,
  });
});

function loadCourse(req, res) {
  const course = Courses.bySlug(req.params.slug);
  // Un cours non publié reste visible pour l'admin (aperçu)
  if (!course || (!course.published && !req.session.isAdmin)) {
    res.status(404).render('error', { title: 'Introuvable', message: "Ce cours n'existe pas." });
    return null;
  }
  return { course, lessons: Lessons.forCourse(course.id) };
}

router.get('/cours/:slug', (req, res) => {
  const data = loadCourse(req, res);
  if (!data) return;
  res.render('course', { title: data.course.title, ...data });
});

router.get('/cours/:slug/lecon/:id', (req, res) => {
  const data = loadCourse(req, res);
  if (!data) return;
  const index = data.lessons.findIndex(l => l.id === Number(req.params.id));
  if (index === -1) {
    return res.status(404).render('error', { title: 'Introuvable', message: "Cette leçon n'existe pas." });
  }
  res.render('lesson', {
    title: `${data.lessons[index].title} · ${data.course.title}`,
    ...data,
    lesson: data.lessons[index],
    index,
    prev: data.lessons[index - 1],
    next: data.lessons[index + 1],
  });
});

export default router;
