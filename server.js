import { createApp } from './src/app.js';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD non défini : copiez .env.example en .env pour accéder à /admin.');
}

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`📚 Mes cours : http://localhost:${port}  (admin : http://localhost:${port}/admin)`);
});
