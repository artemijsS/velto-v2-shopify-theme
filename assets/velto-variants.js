/* Velto — products with variants on product cards.
   <velto-vpick> (snippets/velto-card-qty.liquid) carries the product's variants as JSON.
   Tapping it opens one shared sheet (snippets/velto-variant-sheet.liquid): option chips,
   price of the chosen variant and the regular <velto-qa> stepper bound to that variant,
   so several variants can be added without leaving the listing.
   Cards show "Grozā: N" (sum over all variants) and stay in sync with the cart through
   the `velto:cart` / `velto:qa-set` events fired by assets/velto-card-qty.js. */
(() => {
  if (customElements.get('velto-vpick')) return;

  const unesc = (s) => {
    if (typeof s !== 'string' || !s.includes('&')) return s;
    const ta = document.createElement('textarea');
    ta.innerHTML = s;
    return ta.value;
  };
  const VS = {};
  Object.entries(window.veltoVStrings || {}).forEach(([k, v]) => (VS[k] = unesc(v)));

  const cartMap = () => window.veltoCartQty || {};
  const pending = {}; // optimistic quantities while a velto-qa request is debounced / in flight
  const qtyOf = (id) => (pending[id] !== undefined ? pending[id] : cartMap()[id] || 0);
  const money = (c) => (window.veltoCart && window.veltoCart.money ? window.veltoCart.money(c) : (c / 100).toFixed(2));

  const parse = (el) => {
    if (el._data) return el._data;
    try {
      const d = JSON.parse(el.querySelector('script[data-vpick]').textContent);
      d.v = (d.v || []).filter((v) => v && v.id);
      el._data = d;
    } catch (e) {
      el._data = null;
    }
    return el._data;
  };

  /* ---------------- card ---------------- */
  class VeltoVPick extends HTMLElement {
    connectedCallback() {
      if (!this._init) {
        this._init = true;
        this.btn = this.querySelector('.velto-vpick__btn');
        this.countEl = this.querySelector('[data-vpick-count]');
        this.addEventListener('click', (e) => {
          // the card's title link stretches over the whole card — never navigate from here
          e.preventDefault();
          e.stopPropagation();
          const d = parse(this);
          if (d) sheet.open(d, this.btn || this);
          else if (this.closest('.card-wrapper')) {
            const a = this.closest('.card-wrapper').querySelector('a[href*="/products/"]');
            if (a) window.location.href = a.href;
          }
        });
      }
      this.sync();
    }

    sync() {
      const d = parse(this);
      if (!d) return;
      const n = d.v.reduce((s, v) => s + qtyOf(v.id), 0);
      this.classList.toggle('is-in-cart', n > 0);
      if (this.countEl) this.countEl.textContent = n;
    }
  }
  customElements.define('velto-vpick', VeltoVPick);

  const syncCards = () => document.querySelectorAll('velto-vpick').forEach((el) => el.sync());

  document.addEventListener('velto:qa-set', (e) => {
    const { vid, q } = e.detail || {};
    if (vid === undefined) return;
    pending[vid] = q;
    syncCards();
    sheet.refreshChips();
  });
  document.addEventListener('velto:cart', () => {
    Object.keys(pending).forEach((k) => delete pending[k]);
    syncCards();
    sheet.refreshChips();
  });

  /* ---------------- sheet ---------------- */
  const sheet = {
    el: null,
    d: null,
    sel: [],
    variant: null,

    build() {
      if (this.el) return true;
      const tpl = document.getElementById('VeltoVSheetTpl');
      if (!tpl) return false;
      this.el = tpl.content.firstElementChild.cloneNode(true);
      document.body.appendChild(this.el);
      this.panel = this.el.querySelector('.velto-vsheet__panel');
      this.q = (s) => this.el.querySelector(s);
      this.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-vs-close]')) {
          e.preventDefault();
          this.close();
          return;
        }
        const chip = e.target.closest('[data-vs-opt]');
        if (chip) this.pick(+chip.dataset.vsOpt, chip.dataset.value);
      });
      // on document: focus may sit on <body> (e.g. after Enter in the quantity input)
      document.addEventListener('keydown', (e) => {
        if (!this.d || this.el.hidden) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        } else if (e.key === 'Tab') {
          if (!this.panel.contains(document.activeElement)) {
            e.preventDefault();
            (this.panel.querySelector('.velto-vchip.is-active') || this.panel).focus();
          } else this.trap(e);
        }
      });
      // swipe the sheet down to close (mobile)
      let y0 = null;
      this.panel.addEventListener('touchstart', (e) => {
        y0 = this.panel.scrollTop <= 0 && !e.target.closest('.velto-vsheet__opts-row') ? e.touches[0].clientY : null;
      }, { passive: true });
      this.panel.addEventListener('touchmove', (e) => {
        if (y0 === null) return;
        const dy = e.touches[0].clientY - y0;
        if (dy > 0) {
          this.panel.classList.add('is-drag');
          this.panel.style.transform = `translateY(${dy}px)`;
        }
      }, { passive: true });
      this.panel.addEventListener('touchend', (e) => {
        if (y0 === null) return;
        const dy = (e.changedTouches[0]?.clientY || y0) - y0;
        y0 = null;
        this.panel.classList.remove('is-drag');
        this.panel.style.transform = '';
        if (dy > 90) this.close();
      });
      return true;
    },

    trap(e) {
      const f = [...this.panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')].filter(
        (n) => n.offsetParent !== null && n.tabIndex !== -1
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },

    open(d, opener) {
      if (!this.build()) return;
      this.d = d;
      this.opener = opener;
      // start from a variant that is already in the cart, else the default one, else any available
      const start =
        d.v.find((v) => v.a && qtyOf(v.id) > 0) ||
        d.v.find((v) => v.id === d.s && v.a) ||
        d.v.find((v) => v.a) ||
        d.v[0];
      this.sel = start.o.slice();
      this.q('[data-vs-title]').textContent = d.t;
      this.renderOptions();
      this.update();

      this.el.hidden = false;
      document.body.classList.add('velto-vsheet-open');
      requestAnimationFrame(() => {
        this.el.classList.add('is-open');
        const chip = this.panel.querySelector('.velto-vchip.is-active') || this.panel;
        chip.focus({ preventScroll: true });
      });
      clearTimeout(this.hideTimer);
    },

    close() {
      if (!this.el || this.el.hidden) return;
      this.el.classList.remove('is-open');
      document.body.classList.remove('velto-vsheet-open');
      this.hideTimer = setTimeout(() => {
        this.el.hidden = true;
        // keep the last stepper alive until its debounced request has gone out
        this.q('[data-vs-cta]').innerHTML = '';
        this.variant = null;
      }, 260);
      if (this.opener && this.opener.isConnected) this.opener.focus({ preventScroll: true });
      this.d = null;
    },

    find(sel) {
      return this.d.v.find((v) => v.o.every((x, i) => x === sel[i])) || null;
    },

    renderOptions() {
      const wrap = this.q('[data-vs-opts]');
      wrap.innerHTML = '';
      this.d.o.forEach((name, i) => {
        const values = [];
        this.d.v.forEach((v) => !values.includes(v.o[i]) && values.push(v.o[i]));
        const row = document.createElement('div');
        row.className = 'velto-vsheet__opt';
        const label = document.createElement('div');
        label.className = 'velto-vsheet__opt-label';
        label.id = `VeltoVSheetOpt${i}`;
        label.innerHTML = '<span></span> <strong></strong>';
        label.children[0].textContent = name + ':';
        const chips = document.createElement('div');
        chips.className = 'velto-vsheet__opts-row';
        chips.setAttribute('role', 'radiogroup');
        chips.setAttribute('aria-labelledby', label.id);
        values.forEach((val) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'velto-vchip';
          b.setAttribute('role', 'radio');
          b.dataset.vsOpt = i;
          b.dataset.value = val;
          b.innerHTML = '<span class="velto-vchip__txt"></span><span class="velto-vchip__qty" aria-hidden="true"></span>';
          b.firstChild.textContent = val;
          chips.appendChild(b);
        });
        // arrow keys inside a radio group
        chips.addEventListener('keydown', (e) => {
          if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
          const list = [...chips.children];
          const idx = list.indexOf(document.activeElement);
          if (idx < 0) return;
          e.preventDefault();
          const next = list[(idx + (/Right|Down/.test(e.key) ? 1 : list.length - 1)) % list.length];
          next.focus();
          next.click();
        });
        row.append(label, chips);
        wrap.appendChild(row);
      });
      // a single option with one value is not a choice — hide that row
      wrap.querySelectorAll('.velto-vsheet__opt').forEach((row) => {
        if (row.querySelectorAll('.velto-vchip').length < 2) row.hidden = true;
      });
    },

    pick(i, val) {
      if (!this.d) return;
      const want = this.sel.slice();
      want[i] = val;
      let v = this.find(want);
      if (!v || !v.a) {
        // keep the tapped value, adjust the other options to the closest available variant
        const score = (x) => x.o.reduce((s, o, j) => s + (o === want[j] ? 1 : 0), 0);
        const alt = this.d.v
          .filter((x) => x.o[i] === val && x.a)
          .sort((a, b) => score(b) - score(a))[0];
        if (alt) v = alt;
      }
      this.sel = v ? v.o.slice() : want;
      this.update();
    },

    refreshChips() {
      if (!this.d || !this.el) return;
      this.el.querySelectorAll('.velto-vchip').forEach((b) => {
        const i = +b.dataset.vsOpt;
        const val = b.dataset.value;
        const probe = this.sel.slice();
        probe[i] = val;
        const v = this.find(probe);
        const active = this.sel[i] === val;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-checked', String(active));
        b.tabIndex = active ? 0 : -1;
        b.classList.toggle('is-off', !v || !v.a);
        const n = v ? qtyOf(v.id) : 0;
        b.classList.toggle('has-qty', n > 0);
        b.lastChild.textContent = n > 0 ? n : '';
        b.setAttribute('aria-label', val + (!v || !v.a ? ` — ${VS.sold_out || ''}` : n > 0 ? ` — ${VS.in_cart || ''}: ${n}` : ''));
      });
      this.el.querySelectorAll('.velto-vsheet__opt').forEach((row, i) => {
        row.querySelector('.velto-vsheet__opt-label strong').textContent = this.sel[i] || '';
      });
    },

    update() {
      const d = this.d;
      const v = this.find(this.sel);
      this.refreshChips();

      // image + links
      const url = d.u + (v ? (d.u.includes('?') ? '&' : '?') + 'variant=' + v.id : '');
      this.el.querySelectorAll('[data-vs-link]').forEach((a) => (a.href = url));
      const imgWrap = this.q('.velto-vsheet__img');
      const src = (v && v.img) || d.img;
      if (src) {
        let img = imgWrap.querySelector('img');
        if (!img) {
          img = new Image();
          img.alt = '';
          img.width = 120;
          img.height = 120;
          imgWrap.appendChild(img);
        }
        if (img.getAttribute('src') !== src) img.src = src;
        imgWrap.hidden = false;
      } else imgWrap.hidden = true;

      // price
      const ref = v || d.v.find((x) => x.a) || d.v[0];
      this.q('[data-vs-price]').textContent = money(ref.p);
      const cmp = this.q('[data-vs-compare]');
      cmp.textContent = ref.c > ref.p ? money(ref.c) : '';
      cmp.hidden = !(ref.c > ref.p);
      this.q('.velto-vsheet__price').classList.toggle('is-sale', ref.c > ref.p);
      const unit = this.q('[data-vs-unit]');
      unit.textContent = ref.up || '';
      unit.hidden = !ref.up;

      // quantity control
      if (this.variant === v && v) return;
      this.variant = v;
      const cta = this.q('[data-vs-cta]');
      cta.innerHTML = '';
      if (!v || !v.a) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'velto-vsheet__off';
        b.disabled = true;
        b.textContent = v ? VS.sold_out : VS.unavailable;
        cta.appendChild(b);
        return;
      }
      const tpl = document.getElementById('VeltoVQATpl');
      if (!tpl) return;
      const qa = tpl.content.firstElementChild.cloneNode(true);
      const title = d.t + (d.o.length && !(d.o.length === 1 && d.v.length < 2) ? ' — ' + v.o.join(' / ') : '');
      qa.dataset.variant = v.id;
      qa.dataset.min = v.min || 1;
      qa.dataset.step = v.st || 1;
      if (v.max !== null && v.max !== undefined) qa.dataset.max = v.max;
      qa.dataset.title = title;
      const add = qa.querySelector('[data-qa="add"]');
      if (add) add.setAttribute('aria-label', unesc(add.getAttribute('aria-label') || '').replace('[title]', title));
      const input = qa.querySelector('.velto-qa__input');
      if (input) input.step = v.st || 1;
      cta.appendChild(qa); // <velto-qa> syncs itself from the cart map on connect
      if (pending[v.id] !== undefined && qa.render) qa.render(pending[v.id]);
    },
  };

  // bfcache / other tabs: the cart map is refreshed by velto-card-qty.js → velto:cart
})();
