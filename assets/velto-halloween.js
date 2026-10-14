/* Velto — Halloween decoration (snippets/velto-halloween.liquid). */
(() => {
  if (window.veltoHalloween) return;
  window.veltoHalloween = true;

  const dataEl = document.getElementById('velto-hw-data');
  let D = {};
  try {
    D = JSON.parse(dataEl ? dataEl.textContent : '{}');
  } catch (e) {}

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const HAT =
    '<svg viewBox="0 0 64 52" aria-hidden="true"><path d="M33 3c-3 1-4 5-6 10-3 8-6 16-10 23h28c-2-5-4-12-5-18-1-5 0-9 4-11-4-2-8-5-11-4Z" fill="#f2f2f2"/><path d="M16 33h31l1 5H15l1-5Z" fill="#ff7a1a"/><path d="M3 41c8-4 50-4 58 0-6 5-52 5-58 0Z" fill="#f2f2f2"/></svg>';
  const BAT =
    '<svg viewBox="0 0 64 28" aria-hidden="true"><path fill="currentColor" d="M32 9c-1.5-3-3-4.5-5-4.8.8 1.7.7 3-.3 4C23.5 5.4 17.6 3.6 12 4.6c2.7 1.8 3.8 4.6 3.2 7.6C12 10.6 7 10.6 2 13.8c5.6.8 9.6 3.6 11.8 8 2.8-2.8 6.6-3.8 9.8-2.8 2.4.8 4.2 2.8 5.4 5.6 1-1.6 1.9-2.6 3-3 1.1.4 2 1.4 3 3 1.2-2.8 3-4.8 5.4-5.6 3.2-1 7 0 9.8 2.8 2.2-4.4 6.2-7.2 11.8-8-5-3.2-10-3.2-13.2-1.6-.6-3 .5-5.8 3.2-7.6-5.6-1-11.5.8-14.7 4.6-1-1-1.1-2.3-.3-4C35 4.5 33.5 6 32 9Z"/></svg>';
  const SPIDER =
    '<svg viewBox="0 0 40 36" aria-hidden="true" fill="none" stroke="#e9e9e9" stroke-width="1.6" stroke-linecap="round"><path d="M14 16 4 9M14 19 2 18M14 22 4 29M15 25 9 34M26 16l10-7M26 19l12-1M26 22l10 7M25 25l6 9"/><ellipse cx="20" cy="21" rx="7" ry="8" fill="#151515"/><circle cx="20" cy="11.5" r="4.5" fill="#151515"/><circle cx="18.3" cy="11" r="1" fill="#ff7a1a" stroke="none"/><circle cx="21.7" cy="11" r="1" fill="#ff7a1a" stroke="none"/></svg>';

  /* ---------- witch hat on the logo ---------- */
  const hats = () =>
    document.querySelectorAll('.header__heading-logo-wrapper').forEach((w) => {
      if (w.querySelector('.velto-hw-hat')) return;
      const h = document.createElement('span');
      h.className = 'velto-hw-hat';
      h.innerHTML = HAT;
      w.appendChild(h);
    });

  /* ---------- bats: a small group flies over the top now and then ---------- */
  const bats = () => {
    if (!D.bats || reduced) return;
    const phone = !matchMedia('(min-width: 750px)').matches;
    const sky = document.createElement('div');
    sky.className = 'velto-hw-sky';
    sky.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sky);
    const flight = () => {
      if (document.hidden) return;
      const rtl = Math.random() < 0.5;
      const n = phone ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const b = document.createElement('div');
        b.className = 'velto-hw-bat' + (rtl ? ' is-rtl' : '');
        b.style.setProperty('--y', `${8 + Math.random() * 50}%`);
        b.style.setProperty('--size', `${(phone ? 2.2 : 2.6) + Math.random() * (phone ? 1 : 1.8)}rem`);
        b.style.setProperty('--dur', `${(phone ? 5 : 8) + Math.random() * 3}s`);
        b.style.setProperty('--bob', `${1.5 + Math.random() * 2.5}rem`);
        b.style.animationDelay = `${i * (0.35 + Math.random() * 0.5)}s`;
        b.innerHTML = `<span>${BAT}</span>`;
        b.addEventListener('animationend', (e) => e.target === b && b.remove());
        sky.appendChild(b);
      }
    };
    setTimeout(flight, 2500);
    setInterval(flight, (phone ? 26000 : 22000) + Math.random() * 10000);
  };

  /* ---------- spider on a thread under the header (desktop) ---------- */
  const spider = () => {
    if (!D.spider) return;
    const phone = !matchMedia('(min-width: 990px)').matches;
    const host = document.querySelector('.section-header .header-wrapper, sticky-header, .header-wrapper');
    if (!host || host.querySelector('.velto-hw-spider')) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'velto-hw-spider';
    s.setAttribute('aria-label', '🕷');
    s.style.setProperty('--thread', phone ? `${3 + Math.random() * 2}rem` : `${6 + Math.random() * 5}rem`);
    if (phone) s.classList.add('is-phone');
    s.innerHTML = `<span class="velto-hw-spider__thread"></span>${SPIDER}`;
    s.style.background = 'none';
    s.style.border = '0';
    s.style.padding = '0';
    let t;
    s.addEventListener('click', () => {
      s.classList.add('is-up');
      clearTimeout(t);
      t = setTimeout(() => s.classList.remove('is-up'), 6000);
    });
    host.appendChild(s);
    // phones: only at the top of the page, so it never sits on top of products
    const onScroll = () => s.classList.toggle('is-away', window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  };

  const start = () => {
    hats();
    bats();
    spider();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
