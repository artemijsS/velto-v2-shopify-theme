/* Velto — quantity add-to-cart on product cards.
   <velto-qa data-variant data-min data-step data-max>: "Pievienot" → [− N +] stepper.
   Every change goes to /cart/update.js (debounced; all pending changes are batched and
   only one request is in flight for the whole page, so fast clicks are never lost),
   the header cart bubble is re-rendered, all cards of the same variant stay in sync,
   and a small toast shows the cart total. Cards inserted later (rails, tabs,
   "Rādīt vēl") sync themselves from the shared cart map on connect. */
(() => {
  if (customElements.get('velto-qa')) return;

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
  const S = unesc(window.veltoQAStrings || {});
  const map = (window.veltoCartQty = window.veltoCartQty || {});
  const lang = (document.documentElement.lang || 'lv').split('-')[0];
  let plural;
  try { plural = new Intl.PluralRules(lang); } catch (e) { plural = { select: (n) => (n === 1 ? 'one' : 'other') }; }
  const DEBOUNCE = 380;

  /* ---------- helpers ---------- */
  const itemsLabel = (n) => {
    const key = 'items_' + plural.select(n);
    const s = S[key] && !/translation missing/i.test(S[key]) ? S[key] : S.items_other || '[count]';
    return s.replace('[count]', n);
  };

  const formatMoney = (cents) => {
    const fmt = S.money_format || '€{{amount_with_comma_separator}}';
    const n = cents / 100;
    const group = (x, sep, dec, d) => {
      const [i, f] = x.toFixed(d).split('.');
      return i.replace(/\B(?=(\d{3})+(?!\d))/g, sep) + (f ? dec + f : '');
    };
    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => {
      switch (k) {
        case 'amount_no_decimals': return group(n, ',', '.', 0);
        case 'amount_with_comma_separator': return group(n, '.', ',', 2);
        case 'amount_no_decimals_with_comma_separator': return group(n, '.', ',', 0);
        case 'amount_with_space_separator': return group(n, ' ', ',', 2);
        case 'amount_with_period_and_space_separator': return group(n, ' ', '.', 2);
        default: return group(n, ',', '.', 2);
      }
    }).replace(/<[^>]*>/g, '');
  };

  // fee lines added by the Upcharge Fees app are not goods
  const isFee = (i) =>
    (i.properties && i.properties._mws_fee) || i.product_type === 'mws_fee_generated' || i.product_type === 'velto_delivery';
  const goodsCount = (cart) => cart.items.reduce((s, i) => (isFee(i) ? s : s + i.quantity), 0);

  const cartQty = (cart, id) =>
    cart.items.reduce((s, i) => (String(i.variant_id) === String(id) ? s + i.quantity : s), 0);

  const applyCart = (cart) => {
    Object.keys(map).forEach((k) => delete map[k]);
    cart.items.forEach((i) => (map[i.variant_id] = (map[i.variant_id] || 0) + i.quantity));
    document.querySelectorAll('velto-qa').forEach((el) => el.sync());
    document.dispatchEvent(new CustomEvent('velto:cart', { detail: map }));
    // quantities still waiting to be sent stay optimistic for listeners (velto-variants.js)
    Object.keys(want).forEach((vid) =>
      document.dispatchEvent(new CustomEvent('velto:qa-set', { detail: { vid, q: want[vid] } }))
    );
  };

  const refresh = () =>
    fetch(`${window.routes?.cart_url || '/cart'}.js`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((cart) => (applyCart(cart), cart))
      .catch(() => {});

  const renderBubble = (sections) => {
    const html = sections && sections['cart-icon-bubble'];
    const bubble = document.getElementById('cart-icon-bubble');
    if (!html || !bubble) return;
    const src = new DOMParser().parseFromString(html, 'text/html').querySelector('.shopify-section');
    if (src) bubble.innerHTML = src.innerHTML;
    bubble.classList.remove('velto-bump');
    void bubble.offsetWidth;
    bubble.classList.add('velto-bump');
  };

  /* ---------- toast ---------- */
  let toastEl, toastTimer;
  const toast = (title, cart, isError = false) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'velto-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      toastEl.innerHTML =
        '<span class="velto-toast__icon" aria-hidden="true"></span>' +
        '<span class="velto-toast__body"><strong class="velto-toast__title"></strong><span class="velto-toast__meta"></span></span>' +
        `<a class="velto-toast__link" href="${window.routes?.cart_url || '/cart'}">${S.view_cart || 'Cart'} <span aria-hidden="true">→</span></a>`;
      document.body.appendChild(toastEl);
      toastEl.addEventListener('mouseenter', () => clearTimeout(toastTimer));
      toastEl.addEventListener('mouseleave', () => hideLater(2000));
    }
    toastEl.classList.toggle('is-error', isError);
    toastEl.querySelector('.velto-toast__icon').textContent = isError ? '!' : '✓';
    toastEl.querySelector('.velto-toast__title').textContent = title;
    toastEl.querySelector('.velto-toast__meta').textContent = cart
      ? `${itemsLabel(goodsCount(cart))} · ${formatMoney(cart.total_price)}`
      : '';
    toastEl.querySelector('.velto-toast__link').hidden = !cart || goodsCount(cart) === 0;
    requestAnimationFrame(() => toastEl.classList.add('is-visible'));
    hideLater(isError ? 4200 : 3200);
  };
  const hideLater = (ms) => {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl && toastEl.classList.remove('is-visible'), ms);
  };

  /* ---------- shared optimistic state + ONE request queue for the whole page ----------
     `want` holds the quantities the customer asked for that the server has not confirmed
     yet (per variant, shared by every card of that variant). All pending changes are sent
     together in a single /cart/update request and only one request is in flight at a
     time — parallel cart requests overwrite each other on Shopify's side, and a response
     must never wipe a quantity that was changed while the request was on its way. */
  const want = {};
  let flushTimer = null;
  let inFlight = false;

  const els = (vid) => document.querySelectorAll(`velto-qa[data-variant="${vid}"]`);
  const setBusy = (vids, on) => vids.forEach((v) => els(v).forEach((el) => el.classList.toggle('is-busy', on)));

  const post = async (updates, keepalive = false) => {
    const res = await fetch(window.routes?.cart_update_url || '/cart/update', {
      method: 'POST',
      keepalive,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        updates,
        sections: ['cart-icon-bubble'],
        sections_url: window.location.pathname,
      }),
    });
    const cart = await res.json();
    if (!res.ok || cart.status || !cart.items) throw new Error(cart.description || cart.message || S.error);
    return cart;
  };

  const schedule = () => {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, DEBOUNCE);
  };

  async function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (inFlight) return; // the running request re-flushes when it finishes
    const batch = Object.assign({}, want);
    const vids = Object.keys(batch);
    if (!vids.length) return;

    inFlight = true;
    setBusy(vids, true);
    const before = {};
    vids.forEach((v) => (before[v] = map[v] || 0));
    let cart = null;
    let error = null;
    try {
      try {
        cart = await post(batch);
      } catch (e) {
        if (vids.length === 1) error = e;
        else {
          // one bad line must not block the others — retry them one by one
          for (const v of vids) {
            try { cart = await post({ [v]: batch[v] }); } catch (e2) { error = e2; }
          }
        }
      }

      // confirmed (or failed) — unless the customer changed the number again meanwhile
      vids.forEach((v) => { if (want[v] === batch[v]) delete want[v]; });
      const settled = Object.keys(want).length === 0;

      if (cart) {
        let capped = null;
        vids.forEach((v) => {
          const actual = cartQty(cart, v);
          if (actual < batch[v]) {
            capped = actual;
            els(v).forEach((el) => (el.max = actual));
            if (want[v] !== undefined && want[v] > actual) delete want[v];
          }
        });
        renderBubble(cart.sections);
        applyCart(cart);

        if (error) toast(error.message || S.error, null, true);
        else if (capped !== null) toast((S.max || '[max]').replace('[max]', capped), cart, true);
        else if (settled) {
          const removed = vids.every((v) => batch[v] === 0);
          const added = vids.some((v) => before[v] === 0 && batch[v] > 0);
          toast(removed ? S.removed : added ? S.added : S.updated, cart);
        }
        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'velto-qa', productVariantId: vids[0], cartData: cart });
        }
      } else {
        toast((error && error.message) || S.error, null, true);
      }
      if (error) refresh();
    } finally {
      setBusy(vids, false);
      inFlight = false;
      document.querySelectorAll('velto-qa').forEach((el) => el.sync());
      if (Object.keys(want).length && !flushTimer) flush();
    }
  }

  /* leaving the page before the debounce fired — send what is pending anyway */
  window.addEventListener('pagehide', () => {
    if (!Object.keys(want).length) return;
    clearTimeout(flushTimer);
    flushTimer = null;
    try { post(Object.assign({}, want), true).catch(() => {}); } catch (e) {}
    Object.keys(want).forEach((k) => delete want[k]);
  });

  /* ---------- element ---------- */
  class VeltoQA extends HTMLElement {
    connectedCallback() {
      if (!this._init) {
        this._init = true;
        this.vid = this.dataset.variant;
        this.min = Math.max(1, parseInt(this.dataset.min) || 1);
        this.step = Math.max(1, parseInt(this.dataset.step) || 1);
        this.max = this.dataset.max !== undefined && this.dataset.max !== '' ? parseInt(this.dataset.max) : Infinity;
        this.input = this.querySelector('.velto-qa__input');
        this.incBtn = this.querySelector('[data-qa="inc"]');

        this.addEventListener('click', (e) => {
          const b = e.target.closest('[data-qa]');
          // near-miss around the buttons (the enlarged tap zone): do nothing,
          // never open the product page
          if (e.target === this) { e.preventDefault(); e.stopPropagation(); return; }
          if (!b || b.disabled) return;
          e.preventDefault();
          e.stopPropagation();
          const q = this.qty;
          if (b.dataset.qa === 'add') this.set(this.min, true);
          else if (b.dataset.qa === 'inc') this.set(q + this.step);
          else this.set(q - this.step < this.min ? 0 : q - this.step);
        });

        this.input.addEventListener('focus', () => this.input.select());
        this.input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.input.blur();
          }
        });
        this.input.addEventListener('change', () => {
          const v = parseInt(this.input.value);
          this.set(isNaN(v) || v < 0 ? 0 : this.normalize(v));
        });
      }
      this.sync();
    }

    get qty() {
      return want[this.vid] !== undefined ? want[this.vid] : map[this.vid] || 0;
    }

    normalize(v) {
      if (v <= 0) return 0;
      v = Math.max(v, this.min);
      v = this.min + Math.round((v - this.min) / this.step) * this.step;
      return v;
    }

    capToMax(v) {
      if (v <= this.max) return v;
      let c = this.min + Math.floor((this.max - this.min) / this.step) * this.step;
      return c < this.min ? 0 : c;
    }

    set(v, focusInput = false) {
      if (v > this.max) {
        v = this.capToMax(v);
        toast((S.max || '[max]').replace('[max]', this.max), null, true);
      }
      if (v === this.qty) return this.render(v);
      want[this.vid] = v;
      els(this.vid).forEach((el) => el.render(v));
      document.dispatchEvent(new CustomEvent('velto:qa-set', { detail: { vid: this.vid, q: v } }));
      if (focusInput) requestAnimationFrame(() => this.querySelector('[data-qa="inc"]')?.focus({ preventScroll: true }));
      schedule();
    }

    render(v) {
      this.classList.toggle('is-in-cart', v > 0);
      this.classList.toggle('is-min', v <= this.min);
      if (document.activeElement !== this.input || want[this.vid] === undefined) this.input.value = v;
      if (this.incBtn) this.incBtn.disabled = v + this.step > this.max;
    }

    /* show the cart quantity — or the still-unconfirmed one the customer asked for */
    sync() {
      this.render(this.qty);
    }
  }

  customElements.define('velto-qa', VeltoQA);

  /* cart changed elsewhere (quick-add modal, product page, cart page) → resync */
  const hook = () => {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, (e) => {
        if (e && e.source !== 'velto-qa') refresh();
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();

  /* product page / quick-add modal: replace Dawn's top "added to cart" popup
     with the same small bottom toast the product cards use */
  customElements.whenDefined('cart-notification').then(() => {
    const C = customElements.get('cart-notification');
    if (!C || C.prototype.__velto) return;
    C.prototype.__velto = true;
    C.prototype.renderContents = function (state) {
      this.cartItemKey = state && state.key;
      renderBubble(state && state.sections);
      refresh().then((cart) => toast(S.added || '✓', cart || null));
    };
  });

  /* shared helpers (velto-mine.js, product page toast) */
  window.veltoCart = { refresh, renderBubble, toast, money: formatMoney, itemsLabel, isFee, S };

  /* back/forward cache restores a stale page */
  window.addEventListener('pageshow', (e) => e.persisted && refresh());
})();
