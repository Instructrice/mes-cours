// Ajoute un cours d'exemple pour découvrir la plateforme : npm run seed
import { Courses, Lessons } from '../src/db.js';

if (Courses.bySlug('bien-demarrer')) {
  console.log('Le cours d\'exemple existe déjà.');
  process.exit(0);
}

const id = Courses.create({
  title: 'Bien démarrer',
  category: 'Tutoriel',
  description: 'Un cours d\'exemple pour découvrir **comment fonctionne la plateforme**. Vous pouvez le modifier ou le supprimer depuis l\'admin.',
  published: true,
});

Lessons.create(id, {
  title: 'Regarder une vidéo',
  youtube_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  content: `## Bienvenue 👋

Chaque leçon peut contenir **une vidéo YouTube** et un **contenu en Markdown** en dessous.

- Collez simplement le lien de la vidéo dans l'admin
- Formats acceptés : \`youtube.com/watch?v=…\`, \`youtu.be/…\`, \`/shorts/…\`, avec ou sans \`?t=90\`

> Astuce : utilisez les flèches ← → du clavier pour naviguer entre les leçons.`,
});

Lessons.create(id, {
  title: 'Écrire ses notes en Markdown',
  content: `## Mettre en forme son cours

Le Markdown permet de structurer facilement :

1. Des **listes numérotées**
2. Du texte *en italique* ou **en gras**
3. Des [liens](https://www.markdownguide.org/basic-syntax/)

\`\`\`js
// Et même du code !
console.log('Bonjour');
\`\`\`

| Colonne A | Colonne B |
|-----------|-----------|
| Tableaux  | ✅        |`,
});

Lessons.create(id, {
  title: 'Suivre sa progression',
  content: `Cliquez sur **« Marquer comme terminée »** en bas de chaque leçon (ou passez à la suivante).

Votre progression est enregistrée **dans votre navigateur** et s'affiche sur la page du cours et sur l'accueil.`,
});

console.log('✅ Cours d\'exemple « Bien démarrer » créé.');
