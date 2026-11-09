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
   - Mettez une date d'expiration, générez et copiez le jeton (`github_pat_…`)
3. Ouvrez `…/admin.html`, collez le jeton et **choisissez un mot de passe admin**
   (12 caractères min., 3 types de caractères, ou une phrase de 20 caractères et plus).

C'est tout : ensuite l'admin ne demande plus que le mot de passe. Créez vos cours, cliquez sur
**Publier sur GitHub**, le site se met à jour en 1 à 2 minutes.

## 🔒 Sécurité

**Accès admin uniquement par mot de passe**
- Le jeton GitHub (la seule clé qui permet d'écrire dans `data/courses.json`) est **chiffré** avec votre mot de passe :
  PBKDF2-SHA256 (600 000 itérations) → AES-256-GCM. Il n'est **jamais** stocké en clair, ni dans le dépôt, ni dans le navigateur.
- Le coffre chiffré est enregistré dans `data/admin-vault.json` : vous vous connectez depuis n'importe quel appareil
  avec le seul mot de passe. Quelqu'un qui lit ou copie le dépôt ne voit qu'un bloc chiffré inutilisable sans le mot de passe.
  Toute modification du coffre (chiffré, dépôt, branche) le rend invalide.
- **Personne d'autre ne peut créer ou remplacer le mot de passe** : l'écran de création/réinitialisation est visible par tous,
  mais il n'aboutit que si GitHub accepte d'écrire le coffre dans **ce** dépôt, donc avec un jeton du propriétaire.
  Le dépôt visé est figé sur celui du site : impossible de pointer l'admin vers un autre dépôt.
- Après déverrouillage, le jeton reste **uniquement en mémoire** : bouton « 🔒 Verrouiller », verrouillage automatique
  après 20 minutes d'inactivité ou à la fermeture de l'onglet.
- Délai croissant après 3 mots de passe faux (5 s, 10 s, 20 s… jusqu'à 5 min). La vraie protection contre la force brute
  reste la longueur du mot de passe : **choisissez-en un long et unique**.
- Mot de passe oublié : « Mot de passe oublié ? » sur l'écran de connexion, recollez un jeton GitHub et choisissez un nouveau mot de passe.
  En cas de doute, révoquez le jeton sur GitHub : le coffre devient alors inutilisable.

**Protection contre les injections**
- Toutes les données (lues depuis GitHub, brouillon du navigateur, formulaires) passent par une validation stricte
  (`assets/schema.js`) : champs connus uniquement, types et tailles contrôlés, identifiants sans caractère spécial,
  liens obligatoirement en `https://` (`javascript:`, `data:`… refusés). Une donnée invalide n'est jamais publiée.
- Politique de sécurité du contenu (CSP) stricte sur le site et l'admin : seuls les scripts du site s'exécutent,
  l'admin ne parle qu'à `api.github.com`. L'admin refuse aussi d'être affiché dans le cadre d'un autre site.
- Le Markdown est nettoyé par DOMPurify ; les leçons HTML s'exécutent dans `lesson-frame.html`, un cadre isolé
  (sandbox, origine opaque) qui ne peut lire ni le stockage du site, ni la session admin.
- `npm test` vérifie aussi qu'aucun jeton GitHub en clair n'est présent dans le dépôt.

**À savoir** : le dépôt est public (GitHub Pages gratuit), donc `data/courses.json` est lisible par tous,
**y compris les cours en brouillon**. Le mot de passe protège la **modification**, pas la lecture.

## 🧩 Leçons en HTML

Choisissez le format **HTML** dans le formulaire de leçon, puis collez votre code ou importez un fichier `.html`.

- Un **fragment** (`<h2>…</h2><p>…</p>`) ou une **page complète** (`<!doctype html>…`, avec `<style>` et `<script>`) sont acceptés.
- La leçon s'affiche dans un cadre isolé (iframe *sandbox*) qui s'adapte automatiquement à la hauteur du contenu.
  Vos scripts fonctionnent normalement, mais ils ne peuvent pas accéder au reste du site (ni à la session admin).
- Les ressources externes (images, polices, bibliothèques via CDN) doivent être en `https://…`.
  Pour une image de votre dépôt, utilisez son adresse complète : `https://<compte>.github.io/<depot>/…`.
- Le format Markdown accepte aussi du HTML simple (sans scripts).

## 🎬 Liens YouTube acceptés

`youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, `youtube.com/live/…`, `youtube.com/embed/…`
ou l'identifiant seul. Ajoutez `?t=90` ou `&t=1m30s` pour démarrer à un moment précis.

## 💻 En local

```bash
npm start      # sert le site sur http://localhost:3000
npm test       # liens YouTube, data/courses.json, chiffrement et protections anti-injection
```

Vous pouvez aussi modifier `data/courses.json` à la main et le pousser : c'est le même fichier que l'admin.

## 🗂️ Structure

```
index.html           Site d'apprentissage
admin.html           Espace admin
assets/app.js        Pages : accueil, cours, leçon
assets/admin.js      Admin (connexion par mot de passe) + enregistrement via l'API GitHub
assets/vault.js      Coffre chiffré du jeton GitHub (PBKDF2 + AES-GCM)
assets/schema.js     Validation stricte des données (anti-injection)
assets/lesson-frame.js + lesson-frame.html   Cadre isolé des leçons HTML
assets/common.js     Fonctions partagées (Markdown, progression, thème…)
assets/youtube.js    Analyse des liens YouTube
assets/style.css     Design
assets/vendor/       marked (Markdown) et DOMPurify (sécurité)
data/courses.json    Vos cours
data/admin-vault.json  Coffre chiffré (créé par l'admin, optionnel)
```

## Licence

MIT
