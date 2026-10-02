/* Velto — product rails under the product (sections/velto-product-more.liquid).
   category / brand: cards from the data section "velto-product-rail"
   (Section Rendering on a catalog URL); mine: the customer's most often bought
   products (data of the "Mani pirkumi" page, shared 10-min cache with the
   catalog filter); recent: products viewed on this device. Cards for mine /
   recent come from /products/<handle>?view=card. Rails load when scrolled
   near, skip the current product and hide themselves when empty. */
(() => {
  const root = document.querySelector('.velto-pmore');
  if (!root || root.dataset.init) return;
  root.dataset.init = '1';

  const handle = root.dataset.handle;
  const pid = String(root.dataset.pid);
  const limit = parseInt(root.dataset.limit) || 12;
  const base = root.dataset.root || '';
  const S = JSON.parse(root.querySelector('[data-pmore-strings]').textContent);
  const RECENT = 'velto:recent';
  const MINE = 'velto:mine-data';
  const TTL = 10 * 60 * 1000;

  /* ---------- recently viewed: remember this product ---------- */
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem(RECENT) || '[]').filter((h) => typeof h === 'string');
    localStorage.setItem(RECENT, JSON.stringify([handle, ...recent.filter((h) => h !== handle)].slice(0, 16)));
  } catch (e) {}
  recent = recent.filter((h) => h !== handle);

  /* ---------- helpers ---------- */
  const isCurrent = (li) => !!li.querySelector(`a[href*="/products/${handle}"]`);
  const isSoldOut = (li) => !li.querySelector('velto-qa, modal-opener, product-form button:not([disabled])');

  const fill = (rail, items) => {
    const list = rail.querySelector('.velto-pmore__list');
    const keep = items.filter((li) => li && !isCurrent(li) && !isSoldOut(li)).slice(0, limit);
    if (keep.length < 2) return rail.remove();
    keep.forEach((li) => (li.className = 'velto-pmore__item'));
    list.replaceChildren(...keep);
    rail.hidden = false;
    const nav = rail.querySelector('.velto-pmore__nav');
    const sync = () => {
      if (!nav) return;
      const over = list.scrollWidth > list.clientWidth + 4;
      nav.hidden = !over;
      rail.querySelectorAll('.velto-pmore__arrow').forEach((b) => {
        b.disabled = b.dataset.dir === '-1' ? list.scrollLeft < 4 : list.scrollLeft + list.clientWidth >= list.scrollWidth - 4;
      });
    };
    list.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    rail.querySelectorAll('.velto-pmore__arrow').forEach((b) =>
      b.addEventListener('click', () => {
        const item = list.querySelector('.velto-pmore__item');
        const step = item ? item.getBoundingClientRect().width + 16 : 240;
        list.scrollBy({ left: step * 2 * Number(b.dataset.dir), behavior: 'smooth' });
      })
    );
    sync();
    if (window.veltoCart && window.veltoCart.refresh) window.veltoCart.refresh();
  };

  const fromSection = (src) =>
    fetch(src)
      .then((r) => r.text())
      .then((html) => {
        const list = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-velto-rail]');
        return list ? [...list.children].map((li) => document.adoptNode(li)) : [];
      });

  const cards = (handles) =>
    Promise.all(
      handles.map((h) =>
        fetch(`${base}/products/${h}?view=card`)
          .then((r) => (r.ok ? r.text() : ''))
          .then((html) => {
            if (!html) return null;
            const t = document.createElement('template');
            t.innerHTML = html.trim();
            return t.content.querySelector('li');
          })
          .catch(() => null)
      )
    );

  /* "Mani pirkumi" data — same cache as the catalog filter */
  let minePromise = null;
  const mineData = () => {
    if (minePromise) return minePromise;
    const src = root.dataset.mineSrc;
    if (!src) return (minePromise = Promise.resolve(null));
    minePromise = (async () => {
      try {
        const c = JSON.parse(sessionStorage.getItem(MINE) || 'null');
        if (c && Date.now() - c.t < TTL) return c.d;
      } catch (e) {}
      const parse = (html) => {
        const s = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-mine-data]');
        return s ? JSON.parse(s.textContent) : null;
      };
      const first = parse(await fetch(src).then((r) => r.text()));
      if (!first) return null;
      const d = { orders: first.orders || [], variants: first.variants || {} };
      const pages = Math.min(5, Math.ceil((first.total || 0) / 50));
      const rest = [];
      for (let p = 2; p <= pages; p++) rest.push(fetch(`${src}&page=${p}`).then((r) => r.text()).then(parse));
      (await Promise.all(rest)).forEach((x) => {
        if (!x) return;
        d.orders.push(...(x.orders || []));
        Object.assign(d.variants, x.variants || {});
      });
      try {
        sessionStorage.setItem(MINE, JSON.stringify({ t: Date.now(), d }));
      } catch (e) {}
      return d;
    })().catch(() => null);
    return minePromise;
  };

  /* per product: in how many orders, last date */
  const mineStats = (d) => {
    const by = {};
    (d.orders || [])
      .filter((o) => !o.x)
      .forEach((o) => {
        const seen = new Set();
        o.i.forEach((li) => {
          const v = d.variants[li.v];
          if (!v || !v.u) return;
          const h = v.u.split('/products/')[1];
          if (!h) return;
          const p = (by[h] = by[h] || { h, pid: String(v.pid), times: 0, qty: 0, last: 0, a: false });
          if (!seen.has(h)) {
            p.times++;
            seen.add(h);
          }
          p.qty += li.q;
          p.last = Math.max(p.last, new Date(o.d).getTime());
          p.a = p.a || v.a;
        });
      });
    return Object.values(by);
  };

  /* "Tu šo pirki 5× · pēdējo reizi …" next to the price */
  const boughtLine = async () => {
    const d = await mineData();
    if (!d) return;
    const me = mineStats(d).find((p) => p.pid === pid || p.h === handle);
    if (!me) return;
    let date = '';
    try {
      date = new Intl.DateTimeFormat((S.lang || 'lv').split('-')[0], { day: 'numeric', month: 'short' }).format(new Date(me.last));
    } catch (e) {
      date = new Date(me.last).toLocaleDateString();
    }
    const price = document.querySelector('.product__info-container [id^="price-"]');
    if (!price || document.querySelector('.velto-pmore-bought')) return;
    const p = document.createElement('p');
    p.className = 'velto-pmore-bought';
    p.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.4L16.5 7.5"/><path d="M16.5 3.5v4h-4"/><path d="M16.5 10a6.5 6.5 0 0 1-11.3 4.4L3.5 12.5"/><path d="M3.5 16.5v-4h4"/></svg>';
    p.append(S.bought.replace('[count]', me.times).replace('[date]', date));
    price.after(p);
  };

  const loaders = {
    category: (rail) => fromSection(rail.dataset.src),
    brand: (rail) => fromSection(rail.dataset.src),
    mine: async () => {
      const d = await mineData();
      if (!d) return [];
      const list = mineStats(d)
        .filter((p) => p.a && p.h !== handle)
        .sort((x, y) => y.times - x.times || y.qty - x.qty || y.last - x.last)
        .slice(0, limit);
      return cards(list.map((p) => p.h));
    },
    recent: () => cards(recent.slice(0, limit)),
  };

  const load = (rail) => {
    const fn = loaders[rail.dataset.kind];
    if (!fn) return rail.remove();
    Promise.resolve(fn(rail))
      .then((items) => fill(rail, items || []))
      .catch(() => rail.remove());
  };

  const rails = [...root.querySelectorAll('.velto-pmore__rail')];
  if (!recent.length) root.querySelector('[data-kind="recent"]')?.remove();
  const loadAll = () => rails.filter((r) => r.isConnected).forEach(load);
  // rails are hidden until filled, so watch the whole section
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        loadAll();
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(root);
  } else {
    loadAll();
  }

  if (root.dataset.mineSrc) boughtLine();
})();
