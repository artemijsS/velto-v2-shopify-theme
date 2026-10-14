/* Velto — Halloween decoration (snippets/velto-halloween.liquid):
   witch hat on the logo, spiders hanging in several places, cobwebs in
   corners. Orange accents are pure CSS (assets/velto-halloween.css). */
(() => {
  if (window.veltoHalloween) return;
  window.veltoHalloween = true;

  let D = {};
  try {
    D = JSON.parse((document.getElementById('velto-hw-data') || {}).textContent || '{}');
  } catch (e) {}

  const phone = () => !matchMedia('(min-width: 990px)').matches;

  const HAT =
    '<svg viewBox="0 0 64 52" aria-hidden="true"><path d="M33 3c-3 1-4 5-6 10-3 8-6 16-10 23h28c-2-5-4-12-5-18-1-5 0-9 4-11-4-2-8-5-11-4Z" fill="#f2f2f2"/><path d="M16 33h31l1 5H15l1-5Z" fill="#ff7a1a"/><path d="M3 41c8-4 50-4 58 0-6 5-52 5-58 0Z" fill="#f2f2f2"/></svg>';
  const SPIDER =
    '<svg viewBox="0 0 40 36" aria-hidden="true" fill="none" stroke="#e9e9e9" stroke-width="1.6" stroke-linecap="round"><path d="M14 16 4 9M14 19 2 18M14 22 4 29M15 25 9 34M26 16l10-7M26 19l12-1M26 22l10 7M25 25l6 9"/><ellipse cx="20" cy="21" rx="7" ry="8" fill="#151515"/><circle cx="20" cy="11.5" r="4.5" fill="#151515"/><circle cx="18.3" cy="11" r="1" fill="#ff7a1a" stroke="none"/><circle cx="21.7" cy="11" r="1" fill="#ff7a1a" stroke="none"/></svg>';

  const positioned = (el) => {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  };

  /* ---------- witch hat on the logo ---------- */
  const hats = () =>
    document.querySelectorAll('.header__heading-logo-wrapper').forEach((w) => {
      if (w.querySelector('.velto-hw-hat')) return;
      const h = document.createElement('span');
      h.className = 'velto-hw-hat';
      h.innerHTML = HAT;
      w.appendChild(h);
    });

  /* ---------- a spider on a thread; tap/click → it climbs up for a while ---------- */
  const hang = (host, o) => {
    if (!host || host.querySelector(':scope > .velto-hw-spider')) return;
    const p = phone();
    if (p && o.phone === false) return; // desktop only — on phones it would sit on text
    positioned(host);
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'velto-hw-spider' + (p ? ' is-phone' : '');
    s.setAttribute('aria-hidden', 'true');
    s.tabIndex = -1;
    const [a, b] = p ? o.threadPhone || [3, 5] : o.thread || [5, 9];
    s.style.setProperty('--thread', `${a + Math.random() * (b - a)}rem`);
    s.style.top = o.top || '0';
    s.style[o.side || 'right'] = p ? o.phone || '1.2rem' : o.at || '8%';
    s.style.animationDelay = `${-Math.random() * 5}s`;
    s.innerHTML = `<span class="velto-hw-spider__thread"></span>${SPIDER}`;
    let t;
    s.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      s.classList.add('is-up');
      clearTimeout(t);
      t = setTimeout(() => s.classList.remove('is-up'), 6000);
    });
    host.appendChild(s);
    return s;
  };

  /* ---------- cobweb in a corner ---------- */
  const web = (host, corner, size) => {
    if (!host || host.querySelector(':scope > .velto-hw-web')) return;
    positioned(host);
    const w = document.createElement('span');
    w.className = `velto-hw-web velto-hw-web--${corner}`;
    w.setAttribute('aria-hidden', 'true');
    if (size) w.style.setProperty('--web', size);
    host.appendChild(w);
  };

  const decorate = () => {
    hats();

    // webs — category header, cart summary, "Mani pirkumi", rails under the product
    web(document.querySelector('.velto-coll-hero'), 'tl', '16rem');
    const sum = document.querySelector('.velto-sum__title');
    web(sum && sum.parentElement, 'tr', '10rem');
    web(document.querySelector('.velto-mine__head'), 'tr', '13rem');
    web(document.querySelector('.velto-pmore'), 'tl', '12rem');

    if (!D.spider) return;
    // under the header (phones: only at the top of the page)
    const head = hang(document.querySelector('sticky-header, .header-wrapper'), {
      top: '100%', at: '7%', phone: '1.4rem', thread: [6, 10], threadPhone: [3, 4.5],
    });
    if (head && phone()) {
      const onScroll = () => head.classList.toggle('is-away', window.scrollY > 60);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    // from the top of the footer
    hang(document.querySelector('.velto-footer'), { side: 'left', at: '14%', phone: '62%', thread: [4, 8], threadPhone: [2.5, 4] });
    // category pages
    hang(document.querySelector('.velto-coll-hero'), { at: '22%', phone: false, thread: [5, 8] });
    // above the rails under the product
    hang(document.querySelector('.velto-pmore'), { at: '30%', phone: false, thread: [3, 6] });
    // homepage — a second one in the hero, on the left of the showcase
    hang(document.querySelector('.velto-hero'), { side: 'left', at: '46%', phone: '70%', thread: [8, 13], threadPhone: [4, 6] });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();
})();
