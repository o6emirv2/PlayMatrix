(function(){
      try {
        document.documentElement.classList.remove('pm-admin-guarded');
        document.documentElement.classList.add('pm-admin-booting');
      } catch (_) {}
    })();
