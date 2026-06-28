(function(){
  'use strict';
  function load(){
    try {
      if (window.PMAvatar && typeof window.PMAvatar.loadPublicSettings === 'function') {
        window.PMAvatar.loadPublicSettings().catch(function(){});
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
  window.addEventListener('pm:api-ready', load, { once:true });
})();
