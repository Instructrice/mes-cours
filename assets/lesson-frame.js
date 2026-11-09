// Affiche le HTML d'une leçon envoyé par la page parente (site ou admin).
// Sécurité :
//  - le contenu n'est affiché que si ce cadre est sandboxé (origine opaque « null ») :
//    ouvert directement ou intégré sans sandbox, il n'exécute rien ;
//  - seul un message de la fenêtre parente, venant de NOTRE site, est accepté :
//    un site tiers qui intègre cette page ne peut pas y injecter de code.
(function () {
  'use strict';
  if (window.origin !== 'null' || window.parent === window) return;
  var siteOrigin = new URL(location.href).origin;
  function onMessage(e) {
    if (e.source !== window.parent || e.origin !== siteOrigin) return;
    if (!e.data || typeof e.data.lessonHtml !== 'string') return;
    window.removeEventListener('message', onMessage);
    document.open();
    document.write(e.data.lessonHtml);
    document.close();
  }
  window.addEventListener('message', onMessage);
  window.parent.postMessage({ lessonFrameReady: true }, siteOrigin);
})();
