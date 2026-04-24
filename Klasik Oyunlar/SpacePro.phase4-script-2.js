(() => {
      let lastTouchEnd = 0;
      document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('gestureend', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if ((now - lastTouchEnd) < 320) event.preventDefault();
        lastTouchEnd = now;
      }, { passive: false });
      document.addEventListener('dragstart', (event) => event.preventDefault());
    })();
