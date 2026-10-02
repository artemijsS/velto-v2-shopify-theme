/* Velto — "Mani pirkumi" filter on collection pages
   (snippets/velto-mine-filter.liquid). Purchase data comes from the
   "Mani pirkumi" page (?view=mine-data, up to 250 orders, cached for
   10 min in sessionStorage); cards come from /products/<handle>?view=card
   so they look and work exactly like the grid (quantity stepper, quick add).
   On: the regular grid, filters and "load more" are hidden and the customer's
   products from this collection are shown, most often bought first.
   State lives in the URL (?mine=1) so back/forward and sign-in return work. */
(() => {
  if (customElements.get('velto-mine-filter')) return;

  /* put the toggle into the filter row: desktop — before "Filtri",
     mobile — right after "Filtrēt un kārtot"; otherwise it stays above the grid */
  const place = () => {
    const el = document.querySelector('.velto-mf');
    if (!el) return;
    const home = document.querySelector('.velto-mf-home');
    let target = null;
    if (matchMedia('(min-width: 750px)').matches) {
      const w = document.querySelector('#FacetFiltersForm .facets__wrapper');
      if (w && getComputedStyle(w).display !== 'none') target = ['prepend', w, 'desk'];
    } else {
      const m = document.querySelector('.facets-container .mobile-facets__wrapper');
      if (m) target = ['after', m, 'mob'];
    }
    if (target) {
      if (el.dataset.place === target[2]) return;
      target[1][target[0]](el);
      el.dataset.place = target[2];
      if (home) home.hidden = true;
    } else if (home && el.parentElement !== home) {
      home.appendChild(el);
      el.dataset.place = 'home';
      home.hidden = false;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
  else place();
  matchMedia('(min-width: 750px)').addEventListener('change', place);

  // translations come HTML-escaped from the `t` filter (' → &#39;) — decode for textContent
  const unesc = (o) => {
    const ta = document.createElement('textarea');
    Object.keys(o || {}).forEach((k) => {
      if (typeof o[k] === 'string' && o[k].includes('&')) {
        ta.innerHTML = o[k];
        o[k] = ta.value;
      }
    });
    return o;
  };
  const CACHE = 'velto:mine-data';
  const TTL = 10 * 60 * 1000;
  const MAX_CARDS = 60;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const parseData = (html) => {
    const s = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-mine-data]');
    if (!s) throw new Error('no data');
    return JSON.parse(s.textContent);
  };

  class VeltoMineFilter extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.S = unesc(JSON.parse(this.querySelector('[data-mf-strings]').textContent));
      this.btn = this.querySelector('[data-mf-toggle]');
      this.root = (this.dataset.root || '/').replace(/\/$/, '');
      this.section = this.closest('.shopify-section') || document.body;
      this.btn.addEventListener('click', () => (this.on ? this.disable() : this.enable()));
      // a filter / sort change re-renders the grid — leave "Mani pirkumi" mode
      const leave = (e) => {
        if (this.on && e.target.closest && e.target.closest('facet-filters-form, .active-facets, .facets-container') && !e.target.closest('velto-mine-filter')) this.disable();
      };
      document.addEventListener('change', leave, true);
      document.addEventListener('click', (e) => e.target.closest && e.target.closest('facet-remove, .active-facets a') && leave(e), true);
      // "Mani pirkumi" works on the whole category — it can't be combined with
      // filters / the "Lieliska cena" & "Ekskluzīvi" views: those reset it
      if (new URLSearchParams(location.search).get('mine') === '1') {
        if (this.filtered()) this.setUrl(false);
        else this.enable(true);
      }
    }

    /* filters, a price-category quick filter or a tag view (/collections/x/tag) */
    filtered() {
      const q = new URLSearchParams(location.search);
      if ([...q.keys()].some((k) => k.startsWith('filter.'))) return true;
      const rest = location.pathname.split('/collections/')[1] || '';
      return rest.split('/').filter(Boolean).length > 1;
    }

    setUrl(on) {
      const u = new URL(location.href);
      if (on) u.searchParams.set('mine', '1');
      else u.searchParams.delete('mine');
      history.replaceState(history.state, '', u.toString());
    }

    async data() {
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
        if (c && Date.now() - c.t < TTL) return c.d;
      } catch (e) {}
      const src = this.dataset.src;
      const first = parseData(await fetch(src).then((r) => r.text()));
      const d = { orders: first.orders || [], variants: first.variants || {} };
      const pages = Math.min(5, Math.ceil((first.total || 0) / 50));
      const rest = [];
      for (let p = 2; p <= pages; p++) rest.push(fetch(`${src}&page=${p}`).then((r) => r.text()).then(parseData));
      (await Promise.all(rest)).forEach((x) => {
        d.orders.push(...(x.orders || []));
        Object.assign(d.variants, x.variants || {});
      });
      try {
        sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d }));
      } catch (e) {}
      return d;
    }

    /* products of this collection the customer bought, most often first */
    pick(d) {
      const coll = this.dataset.coll;
      const all = this.dataset.all === 'true';
      const byProduct = {};
      d.orders
        .filter((o) => !o.x)
        .forEach((o) => {
          const seen = new Set();
          o.i.forEach((li) => {
            const v = d.variants[li.v];
            if (!v || !v.u) return;
            if (!all && !(v.col || []).includes(coll)) return;
            const h = v.u.split('/products/')[1];
            if (!h) return;
            const p = (byProduct[h] = byProduct[h] || { h, times: 0, qty: 0, last: 0, a: false });
            if (!seen.has(h)) {
              p.times++;
              seen.add(h);
            }
            p.qty += li.q;
            p.last = Math.max(p.last, new Date(o.d).getTime());
            p.a = p.a || v.a;
          });
        });
      return Object.values(byProduct)
        .sort((x, y) => (y.a ? 1 : 0) - (x.a ? 1 : 0) || y.times - x.times || y.qty - x.qty || y.last - x.last)
        .slice(0, MAX_CARDS);
    }

    async cards(list, grid) {
      const html = await Promise.all(
        list.map((p) =>
          fetch(`${this.root}/products/${p.h}?view=card`)
            .then((r) => (r.ok ? r.text() : ''))
            .catch(() => '')
        )
      );
      const frag = document.createDocumentFragment();
      html.forEach((h, i) => {
        if (!h) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = h.trim();
        const li = tpl.content.querySelector('li.grid__item');
        if (!li) return;
        const inner = li.querySelector('.card__inner') || li.querySelector('.card');
        if (inner && list[i].times > 0) {
          const b = document.createElement('span');
          b.className = 'velto-mf__badge';
          b.textContent = this.S.bought.replace('[count]', list[i].times);
          inner.appendChild(b);
        }
        frag.appendChild(li);
      });
      grid.replaceChildren(frag);
      return grid.children.length;
    }

    async enable(fromUrl) {
      // switched on in a filtered view: open the whole category instead
      if (!fromUrl && this.filtered() && this.dataset.url) {
        location.href = `${this.dataset.url}?mine=1`;
        return;
      }
      this.on = true;
      this.btn.setAttribute('aria-pressed', 'true');
      this.section.classList.add('velto-mf-on');
      if (!fromUrl) this.setUrl(true);

      const container = this.section.querySelector('#ProductGridContainer');
      const orig = this.section.querySelector('#product-grid');
      let wrap = this.section.querySelector('.velto-mf__results');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'velto-mf__results collection page-width';
        wrap.innerHTML =
          '<p class="velto-mf__status" role="status"></p>' +
          `<ul class="${esc(orig && orig.tagName === 'UL' ? orig.className : 'grid product-grid grid--2-col-tablet-down grid--5-col-desktop')}" role="list"></ul>`;
        container.prepend(wrap);
      }
      const grid = wrap.querySelector('ul');
      this.status = wrap.querySelector('.velto-mf__status');
      grid.innerHTML = '<li class="velto-mf__loading"></li>'.repeat(5);
      this.status.textContent = this.S.loading;
      const token = (this.token = {});

      try {
        const d = await this.data();
        if (token !== this.token) return;
        const list = this.pick(d);
        if (!list.length) {
          grid.innerHTML = '';
          this.status.innerHTML = `${esc(this.S.empty)} <button type="button" class="velto-mf__link" data-mf-off>${esc(this.S.show_all)}</button>`;
          this.status.classList.add('is-empty');
          this.status.querySelector('[data-mf-off]').addEventListener('click', () => this.disable());
          return;
        }
        const n = await this.cards(list, grid);
        if (token !== this.token) return;
        this.status.innerHTML = `${esc(this.S.status.replace('[count]', n))} · <button type="button" class="velto-mf__link" data-mf-off>${esc(this.S.show_all)}</button>`;
        this.status.querySelector('[data-mf-off]').addEventListener('click', () => this.disable());
        if (window.veltoCart && window.veltoCart.refresh) window.veltoCart.refresh();
      } catch (e) {
        console.error('[velto-mine-filter]', e);
        if (token !== this.token) return;
        grid.innerHTML = '';
        this.status.textContent = this.S.error;
      }
    }

    disable() {
      this.on = false;
      this.token = {};
      this.btn.setAttribute('aria-pressed', 'false');
      this.section.classList.remove('velto-mf-on');
      this.section.querySelector('.velto-mf__results')?.remove();
      this.setUrl(false);
    }
  }

  customElements.define('velto-mine-filter', VeltoMineFilter);
})();
