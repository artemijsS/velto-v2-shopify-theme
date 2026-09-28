/* Velto — top page-loading bar.
   • Full navigations: starts on click of a same-site link / form submit and
     trickles while the browser loads the next page; the next page finishes it.
   • In-page loads (filters, sorting, "Rādīt vēl", tabs): section-rendering
     fetches that follow a user action within 400 ms.
   Nothing is shown for loads shorter than 150 ms. Public: window.veltoProgress. */
(() => {
  if (window.veltoProgress) return;
  const KEY = 'velto-nav';
  const bar = document.createElement('div');
  bar.className = 'velto-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<span></span>';
  const fill = bar.firstChild;
  let value = 0, timer = null, showTimer = null, active = 0;

  const mount = () => document.body && !bar.isConnected && document.body.appendChild(bar);
  const set = (v) => {
    value = Math.min(v, 0.994);
    fill.style.transform = `scaleX(${value})`;
  };
  const trickle = () => {
    const step = value < 0.3 ? 0.08 : value < 0.6 ? 0.04 : value < 0.85 ? 0.015 : 0.004;
    set(value + step * Math.random() + step / 2);
  };

  const start = (from = 0.08) => {
    mount();
    clearTimeout(showTimer);
    if (bar.classList.contains('is-on')) return;
    showTimer = setTimeout(() => {
      bar.classList.remove('is-done');
      bar.classList.add('is-on');
      set(Math.max(from, value));
      clearInterval(timer);
      timer = setInterval(trickle, 250);
    }, 150);
  };

  const done = () => {
    clearTimeout(showTimer);
    clearInterval(timer);
    if (!bar.classList.contains('is-on')) { value = 0; return; }
    set(1);
    fill.style.transform = 'scaleX(1)';
    bar.classList.add('is-done');
    setTimeout(() => {
      bar.classList.remove('is-on', 'is-done');
      value = 0;
      fill.style.transform = 'scaleX(0)';
    }, 400);
  };

  window.veltoProgress = { start, done };

  /* ---------- full page navigations ---------- */
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    // let other handlers (modals, drawers) cancel first
    setTimeout(() => {
      if (e.defaultPrevented) return;
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch (err) {}
      start();
    }, 0);
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    setTimeout(() => {
      if (e.defaultPrevented || f.target === '_blank') return;
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch (err) {}
      start();
    }, 0);
  });

  // came here from our own navigation → finish the bar smoothly
  let came = 0;
  try { came = +sessionStorage.getItem(KEY) || 0; sessionStorage.removeItem(KEY); } catch (err) {}
  if (came && Date.now() - came < 15000) {
    const run = () => {
      mount();
      bar.classList.add('is-on');
      set(0.7);
      requestAnimationFrame(() => requestAnimationFrame(done));
    };
    document.body ? run() : document.addEventListener('DOMContentLoaded', run);
  }

  // back/forward cache or aborted navigation: never leave the bar hanging
  window.addEventListener('pageshow', (e) => e.persisted && done());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && !active && setTimeout(() => !active && done(), 800));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && done());

  /* ---------- in-page section loads ---------- */
  let lastAction = 0;
  ['click', 'change', 'input', 'submit', 'keydown'].forEach((t) =>
    document.addEventListener(t, () => (lastAction = Date.now()), true)
  );
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    const track =
      Date.now() - lastAction < 400 &&
      /[?&]section_id=|[?&]sections=/.test(url) &&
      !/predictive|\/cart/.test(url);
    if (!track) return origFetch.apply(this, arguments);
    active++;
    start();
    const end = () => { active = Math.max(0, active - 1); if (!active) done(); };
    return origFetch.apply(this, arguments).then((r) => { end(); return r; }, (err) => { end(); throw err; });
  };
})();
