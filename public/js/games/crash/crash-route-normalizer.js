/* PlayMatrix FAZ 3: Crash route normalization extracted from HTML shell. */
if (window.history.replaceState) {
        const hasQueryOrHash = !!(location.search || location.hash);
        if (!hasQueryOrHash && location.pathname !== "/") {
          window.history.replaceState(null, null, "/");
        }
      }
