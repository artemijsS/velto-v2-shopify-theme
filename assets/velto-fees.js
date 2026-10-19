/* Velto — Upcharge Fees app (Depozīts, Maisiņa maksa, Iepakošana) without the wait.
   After every cart change the app re-checks its fee lines (~1–2 s). Out of the box it
   1) covers the whole page with a grey overlay meanwhile, and
   2) reloads the cart page afterwards.
   Here the overlay is never shown (velto-ui.css) — only the checkout buttons wait
   while the app works (html.velto-fees-busy) — and the cart page is not reloaded:
   cart.js re-renders itself on the app's "mwFees::cart::exec::successfully" event.

   The app reads its settings from #mwFeesConfigData. That element is patched
   - on this page: this file must run before the app's bundle — the bundle is a deferred
     module placed by the app embed at the end of <body>, deferred scripts run in
     document order, and this tag comes earlier;
   - on the RU/EN versions: there the app fetches the LV page and parses its config with
     DOMParser, so parsed documents are patched as well. */
(() => {
  const patch = (doc) => {
    const el = doc && doc.getElementById && doc.getElementById('mwFeesConfigData');
    if (!el || !el.textContent || el.dataset.velto) return;
    try {
      const cfg = JSON.parse(el.textContent);
      if (!cfg || !cfg.settings) return;
      cfg.settings.never_reload_cart_page = true;
      cfg.settings.force_reload_page = false;
      el.textContent = JSON.stringify(cfg);
      el.dataset.velto = '1';
    } catch (e) {
      /* leave the app's config untouched */
    }
  };

  patch(document);

  const parse = DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString = function (str, type) {
    const doc = parse.call(this, str, type);
    if (type === 'text/html' && typeof str === 'string' && str.includes('mwFeesConfigData')) patch(doc);
    return doc;
  };

  const root = document.documentElement;
  let busy = false;
  const check = () => {
    const now = !!document.querySelector('.mws-fees-overlay');
    if (now === busy) return;
    busy = now;
    root.classList.toggle('velto-fees-busy', now);
  };
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
  check();
})();
