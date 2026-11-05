# 📚 Mes cours

Plateforme personnelle d'apprentissage **hébergée gratuitement sur GitHub Pages** :
ajoutez vos cours depuis un **espace admin**, puis suivez-les leçon par leçon avec **vidéos YouTube**, notes en **Markdown** et **suivi de progression**.

- Site : `https://<votre-compte>.github.io/<nom-du-depot>/`
- Admin : `https://<votre-compte>.github.io/<nom-du-depot>/admin.html`

## ✨ Fonctionnalités

**Pour apprendre**
- Catalogue des cours avec recherche et filtre par catégorie
- Lecteur **YouTube intégré** (`youtube-nocookie.com`, temps de départ `?t=` respecté)
- Contenu en **Markdown** (titres, listes, code, tableaux, images…) **ou en HTML** :
  des pages libres avec leur propre CSS et JavaScript (quiz, exercices, animations…)
- « Marquer comme terminée », bouton **Reprendre le cours**, navigation ← / → au clavier
- Progression enregistrée dans le navigateur, thème clair / sombre, adapté au mobile

**Admin**
- Créer / modifier / supprimer des cours (titre, catégorie, description, couverture, publié ou brouillon)
- Leçons avec lien YouTube (**aperçu vidéo en direct**) et contenu Markdown ou HTML (**aperçu en direct**)
- **Import d'un fichier `.html`** en un clic (le titre de la page est repris automatiquement)
- Réordonner les leçons (↑ ↓), « Enregistrer et ajouter une autre »
- Bouton **Publier sur GitHub** : enregistre tout dans `data/courses.json` du dépôt
- Brouillon conservé automatiquement dans le navigateur tant que vous n'avez pas publié

## 🚀 Mise en ligne (une seule fois)

1. **Activer GitHub Pages** : dans le dépôt, *Settings → Pages → Build and deployment*,
   Source « Deploy from a branch », branche `main`, dossier `/ (root)`, puis *Save*.
   Après 1 à 2 minutes le site est visible à l'adresse indiquée.
2. **Créer un jeton pour l'admin** : ouvrez <https://github.com/settings/personal-access-tokens/new>
   - *Repository access* : « Only select repositories » → ce dépôt
   - *Permissions → Repository permissions → Contents* : **Read and write**
   - Générez et copiez le jeton (`github_pat_…`)
3. Ouvrez `…/admin.html`, allez dans **Réglages**, collez le jeton puis « Enregistrer et tester ».

C'est tout : créez vos cours, cliquez sur **Publier sur GitHub**, le site se met à jour en 1 à 2 minutes.

## 🔒 Sécurité, à savoir

- Le jeton est stocké **uniquement dans votre navigateur**. Sans lui, la page admin ne peut rien modifier :
  n'importe qui peut l'ouvrir mais personne ne peut publier.
- Utilisez l'admin seulement sur vos appareils personnels et donnez au jeton l'accès à **ce seul dépôt**.
- Un dépôt public (nécessaire pour GitHub Pages gratuit) rend `data/courses.json` lisible par tous,
  **y compris les cours en brouillon**. Ne mettez rien de confidentiel.

## 🧩 Leçons en HTML

Choisissez le format **HTML** dans le formulaire de leçon, puis collez votre code ou importez un fichier `.html`.

- Un **fragment** (`<h2>…</h2><p>…</p>`) ou une **page complète** (`<!doctype html>…`, avec `<style>` et `<script>`) sont acceptés.
- La leçon s'affiche dans un cadre isolé (iframe *sandbox*) qui s'adapte automatiquement à la hauteur du contenu.
  Vos scripts fonctionnent normalement, mais ils ne peuvent pas accéder au reste du site (ni au jeton de l'admin).
- Les ressources externes (images, polices, bibliothèques via CDN) doivent être en `https://…`.
  Pour une image de votre dépôt, utilisez son adresse complète : `https://<compte>.github.io/<depot>/…`.
- Le format Markdown accepte aussi du HTML simple (sans scripts).

## 🎬 Liens YouTube acceptés

`youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, `youtube.com/live/…`, `youtube.com/embed/…`
ou l'identifiant seul. Ajoutez `?t=90` ou `&t=1m30s` pour démarrer à un moment précis.

## 💻 En local

```bash
npm start      # sert le site sur http://localhost:3000
npm test       # vérifie les liens YouTube et data/courses.json
```

Vous pouvez aussi modifier `data/courses.json` à la main et le pousser : c'est le même fichier que l'admin.

## 🗂️ Structure

```
index.html           Site d'apprentissage
admin.html           Espace admin
assets/app.js        Pages : accueil, cours, leçon
assets/admin.js      Admin + enregistrement via l'API GitHub
assets/common.js     Fonctions partagées (Markdown, progression, thème…)
assets/youtube.js    Analyse des liens YouTube
assets/style.css     Design
assets/vendor/       marked (Markdown) et DOMPurify (sécurité)
data/courses.json    Vos cours
```

## Licence

MIT
