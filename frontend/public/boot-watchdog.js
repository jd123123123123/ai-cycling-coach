/* Why this is a FILE and not an inline <script>.
 *
 * This app is served with `script-src 'self'` — no `unsafe-inline`, no nonce.
 * The first version of this watchdog was an inline block in index.html, and in
 * production the browser refused to execute it: "Executing inline script
 * violates the following Content Security Policy directive". It never ran once.
 * A separate same-origin file is what that policy does allow, and it still
 * loads when the app's own module graph does not — which is the only situation
 * it exists for.
 *
 * What it does: if nothing has replaced the boot card after 8 seconds, the app
 * did not start. Say so, and say ENOUGH to tell the two cases apart from a
 * screenshot: which build this device is running, and how far the boot got.
 */
(function () {
  var marks = { t0: Date.now(), mounted: false, error: null };

  // Anything the page throws before React mounts — a chunk that 404s after a
  // deploy, a module that throws at import time — lands here. Without this the
  // most useful sentence in the whole failure is only in a console nobody on a
  // phone can open.
  window.addEventListener('error', function (e) {
    if (!marks.error) {
      marks.error = String((e && (e.message || (e.error && e.error.message))) || 'script error');
      if (e && e.filename) marks.error += ' @ ' + String(e.filename).split('/').pop();
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    if (!marks.error) marks.error = 'promise: ' + String((e && e.reason && (e.reason.message || e.reason)) || 'rejected');
  });

  try {
    localStorage.setItem('ridr.lastBoot', JSON.stringify({ at: new Date().toISOString() }));
  } catch (_) { /* private mode */ }

  setTimeout(function () {
    var boot = document.getElementById('boot');
    if (!boot) return;             // React replaced it — the app started.

    var msg = document.getElementById('boot-msg');
    var btn = document.getElementById('boot-retry');
    var det = document.getElementById('boot-detail');

    if (msg) msg.textContent = 'Die App konnte nicht starten.';
    if (det) {
      var meta = document.querySelector('meta[name="ridr:build"]');
      var lines = [
        'build ' + ((meta && meta.content) || '?'),
        'nach ' + Math.round((Date.now() - marks.t0) / 1000) + ' s',
      ];
      if (marks.error) lines.push(marks.error);
      det.textContent = lines.join(' · ');
      det.style.display = 'block';
    }
    if (btn) {
      btn.hidden = false;
      btn.onclick = function () {
        // A reload that reuses the same cached document would reproduce the
        // same failure, which is what makes this bug feel unfixable. Bust it.
        try { location.replace(location.pathname + '?r=' + Date.now()); }
        catch (_) { location.reload(); }
      };
    }
    try {
      localStorage.setItem('ridr.lastCrash', JSON.stringify({
        at: new Date().toISOString(), phase: 'never-mounted', message: marks.error || 'no error surfaced',
      }));
    } catch (_) { /* private mode */ }
  }, 8000);
})();
