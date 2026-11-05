# 📚 Mes cours

Plateforme personnelle d'apprentissage : **ajoutez vos cours depuis un espace admin**, puis **suivez-les leçon par leçon** avec vidéos YouTube intégrées, notes en Markdown et suivi de progression.

## ✨ Fonctionnalités

**Côté apprenant**
- Catalogue des cours avec recherche et filtre par catégorie
- Page de cours avec programme et barre de progression
- Lecteur **YouTube intégré** (mode confidentialité renforcée `youtube-nocookie.com`, temps de départ `?t=` respecté)
- Contenu de leçon en **Markdown** (titres, listes, code, tableaux, images, liens…)
- « Marquer comme terminée », bouton **Reprendre le cours**, navigation ← / → au clavier
- Progression enregistrée dans le navigateur, thème clair / sombre, responsive mobile

**Côté admin** (`/admin`, protégé par mot de passe)
- Créer / modifier / supprimer des cours (titre, catégorie, description, couverture, publié ou brouillon)
- Ajouter des leçons avec lien YouTube (**aperçu vidéo en direct**) et contenu Markdown (**aperçu en direct**)
- Réordonner les leçons (↑ ↓), « Enregistrer et ajouter une autre » pour enchaîner
- Couverture automatique : miniature de la première vidéo si aucune image n'est fournie
- Aperçu des cours en brouillon avant publication

## 🚀 Démarrage

Prérequis : **Node.js 22.13 ou plus** (la base SQLite est intégrée à Node, aucune installation de base de données).

```bash
git clone https://github.com/<votre-compte>/mes-cours.git
cd mes-cours
npm install
cp .env.example .env      # puis choisissez votre ADMIN_PASSWORD
npm run seed              # (optionnel) ajoute un cours d'exemple
npm start
```

Ouvrez http://localhost:3000 — l'admin est sur http://localhost:3000/admin.

En développement, `npm run dev` relance le serveur à chaque modification.

## ⚙️ Configuration (`.env`)

| Variable | Rôle |
|---|---|
| `ADMIN_PASSWORD` | Mot de passe de l'espace admin (**obligatoire**) |
| `SESSION_SECRET` | Clé de signature des sessions — à définir pour rester connecté après un redémarrage |
| `PORT` | Port HTTP (défaut `3000`) |
| `SITE_NAME` | Nom affiché dans l'en-tête |
| `DB_PATH` | Emplacement de la base SQLite (défaut `data/cours.db`) |
| `TRUST_PROXY` / `NODE_ENV=production` | Derrière un proxy HTTPS : cookies sécurisés |

## 🎬 Liens YouTube acceptés

`youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, `youtube.com/live/…`, `youtube.com/embed/…`, ou l'identifiant seul. Ajoutez `?t=90` ou `&t=1m30s` pour démarrer à un moment précis.

## 🐳 Docker

```bash
docker build -t mes-cours .
docker run -p 3000:3000 -e ADMIN_PASSWORD=monmotdepasse -e SESSION_SECRET=unelonguechaine -v mes-cours-data:/data mes-cours
```

## ☁️ Mise en ligne

L'application a besoin d'un serveur Node (pas GitHub Pages) et d'un **disque persistant** pour `data/cours.db` : Render (avec disque), Railway, Fly.io, un VPS… Pensez à définir `ADMIN_PASSWORD`, `SESSION_SECRET`, `TRUST_PROXY=1` et `NODE_ENV=production`.

**Sauvegarde** : il suffit de copier le fichier `data/cours.db`.

## 🗂️ Structure

```
server.js              Point d'entrée
src/app.js             Configuration Express
src/db.js              Base SQLite (cours, leçons)
src/youtube.js         Analyse des liens YouTube
src/routes/public.js   Pages apprenant
src/routes/admin.js    Espace admin
views/                 Templates EJS
public/                CSS et JavaScript du navigateur
scripts/seed.js        Cours d'exemple
test/                  Tests (npm test)
```

## 🧪 Tests

```bash
npm test
```

## Licence

MIT
