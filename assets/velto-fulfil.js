/* Velto — own delivery / pickup block on the cart page.

   <velto-fulfil> (snippets/velto-fulfil.liquid) lets the customer pick
   method → address (zone) or pickup point → day → time slot → contact phone, and keeps the
   cart in line with the choice:
     - cart attributes (ATTR below) — they end up in the order;
     - one line of the hidden "velto_delivery" product (variant = zone price).
   Checkout is held back until the choice is complete and the worker confirms
   the slot is still free. If the worker does not answer, the customer is let
   through: an outage there must never stop orders.

   Weekdays are ISO: 1 = Monday … 7 = Sunday. Dates are Riga wall-clock dates. */
(() => {
  // names of the cart / order attributes — the worker reads the first three (src/index.js)
  const ATTR = {
    method: 'Delivery method',
    date: 'Delivery date',
    slot: 'Delivery slot',
    zone: 'Delivery zone',
    address: 'Delivery address',
    coords: 'Delivery coordinates',
    pickup: 'Pickup point', // the point's name — short, usable as an order tag
    pickupAddress: 'Pickup address',
    contact: 'Contact phone',
    comment: 'Order comment',
    lang: 'Order language', // storefront language: the confirmation e-mail block uses it
  };
  const CONTACT_KEY = 'velto-fulfil-contact';
  const DELIVERY_TYPE = 'velto_delivery';

  /* ---------- cycle logic: same as the worker's src/cycle.js, keep in sync ---------- */
  const TZ = 'Europe/Riga';
  const DAY = 864e5;

  function rigaNow(at = new Date()) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(at).map((x) => [x.type, x.value])
    );
    return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
  }

  const isoDow = (d) => ((d.getUTCDay() + 6) % 7) + 1;
  const ymd = (d) => d.toISOString().slice(0, 10);
  const slotKey = (date, method, slot) => `${date}|${method}|${slot}`;

  function cutoffAfter(settings, now) {
    const dow = Number(settings.cutoffWeekday) || 3;
    const [hh, mm] = String(settings.cutoffTime || '05:00').split(':').map((n) => parseInt(n, 10) || 0);
    const today0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let cutoff = new Date(today0 + ((dow - isoDow(now) + 7) % 7) * DAY + (hh * 60 + mm) * 6e4);
    if (cutoff <= now) cutoff = new Date(cutoff.getTime() + 7 * DAY);
    return cutoff;
  }

  function buildOptions(config, now, booked = {}) {
    const settings = config.settings || {};
    const cutoff = cutoffAfter(settings, now);
    const cutoffDow = isoDow(cutoff);
    const cutoffDay0 = Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate());
    const closed = config.closed || [];
    const byDate = new Map();

    (config.days || []).forEach((day) => {
      const weekday = Number(day.weekday);
      const method = day.method;
      if (!(weekday >= 1 && weekday <= 7) || (method !== 'delivery' && method !== 'pickup')) return;
      const date = ymd(new Date(cutoffDay0 + (((weekday - cutoffDow + 7) % 7) || 7) * DAY));
      if (closed.some((c) => c.date === date && (c.scope === 'all' || c.scope === method || !c.scope))) return;
      const limit = Number(day.limit) || 0;
      const slots = (day.slots || [])
        .map((s) => String(s).trim())
        .filter((s) => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(s))
        .map((slot) => {
          const n = booked[slotKey(date, method, slot)] || 0;
          return { slot, limit, booked: n, full: limit > 0 && n >= limit };
        });
      if (!slots.length) return;
      if (!byDate.has(date)) byDate.set(date, { date, weekday, delivery: [], pickup: [] });
      byDate.get(date)[method].push(...slots);
    });

    const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    days.forEach((d) => {
      d.delivery.sort((a, b) => (a.slot.padStart(11, '0') < b.slot.padStart(11, '0') ? -1 : 1));
      d.pickup.sort((a, b) => (a.slot.padStart(11, '0') < b.slot.padStart(11, '0') ? -1 : 1));
    });
    return { cutoff, days };
  }
  /* ---------- end of shared logic ---------- */

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Zone polygon. Accepts a plain list [[lat, lng], …] or {lat, lng} objects, and
  // GeoJSON as exported by map tools (geojson.io, Google My Maps): FeatureCollection,
  // Feature, Polygon or LineString. Either coordinate order works — in Latvia
  // latitude is always the bigger number.
  function polygonPoints(raw) {
    let poly = raw;
    if (typeof poly === 'string') {
      try { poly = JSON.parse(poly); } catch (e) { poly = []; }
    }
    if (poly && poly.type === 'FeatureCollection') poly = (poly.features || [])[0];
    if (poly && poly.type === 'Feature') poly = poly.geometry;
    if (poly && poly.type === 'MultiPolygon') poly = (poly.coordinates || [])[0];
    else if (poly && (poly.type === 'Polygon' || poly.type === 'LineString')) poly = poly.coordinates;
    // a polygon is a list of rings: take the outer one
    if (Array.isArray(poly) && Array.isArray(poly[0]) && Array.isArray(poly[0][0])) poly = poly[0];
    if (!Array.isArray(poly)) return [];
    return poly
      .map((p) => {
        const a = Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p && p.lat), Number(p && p.lng)];
        return a[0] < a[1] ? [a[1], a[0]] : a;
      })
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function inPolygon(lat, lng, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [yi, xi] = pts[i];
      const [yj, xj] = pts[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // also used by the delivery page map (assets/velto-fulfil-page.js)
  window.VeltoFulfilGeo = { polygonPoints, inPolygon };

  const parseCoords = (s) => {
    const m = String(s || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
  };

  if (customElements.get('velto-fulfil')) return;

  class VeltoFulfil extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      try {
        this.cfg = JSON.parse(this.querySelector('script[data-config]').textContent);
      } catch (e) {
        console.error('[velto-fulfil] bad config', e);
        return;
      }
      const cfg = this.cfg;
      this.t = cfg.t || {};
      // cheapest first: where zones overlap, the address gets the cheaper one
      this.zones = (cfg.zones || [])
        .map((z) => ({ ...z, points: polygonPoints(z.polygon) }))
        .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      this.min = Number(cfg.settings.minOrderDelivery) || 0;
      this.icons = {};
      this.querySelectorAll('template[data-icon]').forEach((tpl) => (this.icons[tpl.dataset.icon] = tpl.innerHTML.trim()));

      const a = cfg.attributes || {};
      this.state = {
        method: a[ATTR.method] === 'delivery' || a[ATTR.method] === 'pickup' ? a[ATTR.method] : '',
        date: a[ATTR.date] || '',
        slot: a[ATTR.slot] || '',
        address: a[ATTR.address] || '',
        coords: a[ATTR.coords] || '',
        pickup: a[ATTR.pickup] || '',
        comment: a[ATTR.comment] || '',
        // this cart → this browser → the customer's last order / account (Liquid)
        contact: a[ATTR.contact] || this.stored() || cfg.contact || '',
      };
      this.booked = {};
      this.skew = 0;
      this.cart = null;
      this.sugs = [];
      this.active = -1;
      this.error = '';

      const body = this.querySelector('[data-body]');
      body.innerHTML =
        '<div data-r="summary"></div><div data-r="methods"></div><div data-r="hint"></div><div data-r="place"></div>' +
        '<div data-r="when"></div><div data-r="comment"></div><div data-r="contact"></div><div data-r="msg"></div><div data-r="deadline"></div>';
      this.r = {};
      body.querySelectorAll('[data-r]').forEach((el) => (this.r[el.dataset.r] = el));

      this.addEventListener('click', (e) => this.onClick(e));
      this.addEventListener('input', (e) => this.onInput(e));
      this.addEventListener('keydown', (e) => this.onKeydown(e));
      // The block sits inside <cart-items>, which treats every "change" event as a
      // quantity change and validates the field as a quantity ("only in steps of …").
      // Our address and phone fields are not quantities: keep their events to ourselves.
      this.addEventListener('change', (e) => e.stopPropagation());
      this.addEventListener('focusout', (e) => {
        if (e.target.matches('[data-address]')) setTimeout(() => this.hideList(), 150);
      });
      this.guard = (e) => this.onCheckoutClick(e);
      document.addEventListener('click', this.guard, true);

      // the cart changes: quantities (cart.js), fee lines (Upcharge Fees app)
      this.queueCart = () => {
        clearTimeout(this.cartTimer);
        this.cartTimer = setTimeout(() => this.refreshCart().then(() => this.reconcile()), 300);
      };
      if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        this.unsub = subscribe(PUB_SUB_EVENTS.cartUpdate, this.queueCart);
      }
      const summary = document.querySelector('#main-cart-footer .cart__blocks');
      if (summary) {
        this.observer = new MutationObserver(this.queueCart);
        this.observer.observe(summary, { childList: true, subtree: true, characterData: true });
      }
      // the cycle rolls over while the page is open
      this.timer = setInterval(() => this.tick(), 60000);
      document.addEventListener('visibilitychange', (this.onVisible = () => {
        if (document.visibilityState === 'visible') this.loadAvailability();
      }));

      this.normalize();
      // a complete choice is folded into one line; "change" opens it again
      this.open = !!this.problem();
      this.render();
      this.refreshCart().then(() => this.reconcile());
      this.loadAvailability();
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.guard, true);
      document.removeEventListener('visibilitychange', this.onVisible);
      clearInterval(this.timer);
      clearTimeout(this.cartTimer);
      if (this.observer) this.observer.disconnect();
      if (this.unsub) this.unsub();
      this.ready = false;
    }

    stored() {
      try {
        return localStorage.getItem(CONTACT_KEY) || '';
      } catch (e) {
        return '';
      }
    }

    /* ---------- derived state ---------- */
    now() {
      return rigaNow(new Date(Date.now() + this.skew));
    }

    options() {
      return buildOptions(this.cfg, this.now(), this.booked);
    }

    get zone() {
      const c = parseCoords(this.state.coords);
      if (!c) return null;
      return this.zones.find((z) => z.points.length > 2 && inPolygon(c.lat, c.lng, z.points)) || null;
    }

    get point() {
      return (this.cfg.pickupPoints || []).find((p) => p.name === this.state.pickup) || null;
    }

    get goods() {
      if (!this.cart) return null;
      return this.cart.items.reduce((s, i) => (this.isFee(i) || this.isDelivery(i) ? s : s + i.final_line_price), 0);
    }

    isFee(i) {
      return (i.properties && i.properties._mws_fee) || i.product_type === 'mws_fee_generated';
    }

    isDelivery(i) {
      return i.product_type === DELIVERY_TYPE;
    }

    belowMin() {
      const g = this.goods;
      return this.min > 0 && g !== null && g < this.min;
    }

    money(cents) {
      try {
        return new Intl.NumberFormat(this.cfg.locale, { style: 'currency', currency: this.cfg.currency || 'EUR' }).format(cents / 100);
      } catch (e) {
        return `${(cents / 100).toFixed(2)} €`;
      }
    }

    /* drop a day / slot that can no longer be chosen; returns true if something changed */
    normalize() {
      const s = this.state;
      const before = JSON.stringify(s);
      const pts = this.cfg.pickupPoints || [];
      // delivery needs the minimum order amount
      if (s.method === 'delivery' && this.belowMin()) s.method = '';
      if (s.method === 'pickup') {
        if (pts.length === 1) s.pickup = pts[0].name;
        else if (s.pickup && !pts.some((p) => p.name === s.pickup)) s.pickup = '';
      }
      if (!s.method) {
        s.date = '';
        s.slot = '';
      } else {
        const day = this.options().days.find((d) => d.date === s.date && d[s.method].length);
        if (!day) {
          s.date = '';
          s.slot = '';
        } else if (!day[s.method].some((x) => x.slot === s.slot && !x.full)) {
          s.slot = '';
        }
      }
      return before !== JSON.stringify(s);
    }

    /* ---------- rendering ---------- */
    render() {
      this.renderSummary();
      this.renderMethods();
      this.renderPlace();
      this.renderWhen();
      this.renderComment();
      this.renderContact();
      this.renderNotes();
    }

    // optional order note from the customer, for delivery and pickup alike;
    // built once so typing is never interrupted
    renderComment() {
      if (this.r.comment.firstChild) return;
      const { t } = this;
      this.r.comment.innerHTML =
        `<label class="velto-fulfil__label" for="VeltoFulfilComment">${esc(t.comment_label)}</label>` +
        `<textarea class="velto-fulfil__input velto-fulfil__textarea" id="VeltoFulfilComment" data-comment rows="2" maxlength="300" placeholder="${esc(t.comment_placeholder)}">${esc(this.state.comment)}</textarea>`;
    }

    // built once: the field keeps focus while the rest of the block re-renders
    renderContact() {
      if (this.r.contact.firstChild) return;
      const { t } = this;
      this.r.contact.innerHTML =
        `<label class="velto-fulfil__label" for="VeltoFulfilContact">${esc(t.contact_label)}</label>` +
        `<input class="velto-fulfil__input" id="VeltoFulfilContact" data-contact type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="+371" value="${esc(this.state.contact)}">` +
        `<p class="velto-fulfil__zone">${esc(t.contact_hint)}</p>`;
    }

    renderSummary() {
      const { t, state: s } = this;
      const folded = !this.open && !this.problem();
      this.classList.toggle('velto-fulfil--folded', folded);
      if (!folded) {
        this.r.summary.innerHTML = '';
        return;
      }
      const date = new Date(`${s.date}T00:00:00Z`);
      const day = new Intl.DateTimeFormat(this.cfg.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
      const zone = this.zone;
      const price = s.method === 'pickup' || !zone || !(zone.price > 0) ? t.free : this.money(zone.price);
      const point = this.point;
      const where = s.method === 'delivery' ? s.address : [s.pickup, point && point.address].filter(Boolean).join(', ');
      this.r.summary.innerHTML =
        `<div class="velto-fulfil__sum">` +
        `<span class="velto-fulfil__icon" aria-hidden="true">${this.icons[s.method] || ''}</span>` +
        `<span class="velto-fulfil__sum-text"><strong>${esc(s.method === 'delivery' ? t.delivery : t.pickup)} · ${esc(price)}</strong>` +
        `<span class="velto-fulfil__sum-when">${esc(day)}, ${esc(s.slot.replace('-', '–'))}</span>` +
        `<small>${esc([where, s.contact].filter(Boolean).join(' · '))}</small></span>` +
        `<button type="button" class="velto-fulfil__edit" data-edit>${esc(t.change)}</button></div>`;
    }

    renderMethods() {
      const { t, state } = this;
      const below = this.belowMin();
      const zone = this.zone;
      const sub = {
        delivery: below
          ? `${t.delivery_from.replace('[amount]', this.money(this.min))} · ${t.delivery_missing.replace('[missing]', this.money(this.min - this.goods))}`
          : zone
            ? zone.price > 0 ? this.money(zone.price) : t.free
            : t.price_by_address,
        pickup: t.free,
      };
      const btn = (m, label) =>
        `<button type="button" class="velto-fulfil__opt velto-fulfil__method" role="radio" aria-checked="${state.method === m}" data-method="${m}"${m === 'delivery' && below ? ' disabled' : ''}>` +
        `<span class="velto-fulfil__icon" aria-hidden="true">${this.icons[m] || ''}</span>` +
        `<span class="velto-fulfil__method-text">${esc(label)}<small>${esc(sub[m])}</small></span></button>`;
      this.r.methods.innerHTML = `<div class="velto-fulfil__methods" role="radiogroup">${btn('delivery', t.delivery)}${btn('pickup', t.pickup)}</div>`;
    }

    renderPlace() {
      const { t, state } = this;
      // the address field is built once per method so typing is never interrupted
      if (this.placeFor !== state.method) {
        this.placeFor = state.method;
        if (state.method === 'delivery') {
          this.r.place.innerHTML =
            `<label class="velto-fulfil__label" for="VeltoFulfilAddress">${esc(t.address_label)}</label>` +
            `<div class="velto-fulfil__ac">` +
            `<input class="velto-fulfil__input" id="VeltoFulfilAddress" data-address type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="VeltoFulfilList" aria-autocomplete="list" placeholder="${esc(t.address_placeholder)}" value="${esc(state.address)}">` +
            `<ul class="velto-fulfil__list" id="VeltoFulfilList" role="listbox" hidden></ul>` +
            `</div><p class="velto-fulfil__zone" data-zone hidden></p>`;
        } else if (state.method === 'pickup') {
          this.r.place.innerHTML = '<div data-points></div>';
        } else {
          this.r.place.innerHTML = '';
        }
      }
      if (state.method === 'delivery') {
        const line = this.r.place.querySelector('[data-zone]');
        const zone = this.zone;
        if (zone) {
          line.hidden = false;
          line.className = 'velto-fulfil__zone velto-fulfil__zone--ok';
          line.textContent = t.zone_ok.replace('[zone]', zone.name).replace('[price]', zone.price > 0 ? this.money(zone.price) : t.free);
        } else if (state.coords) {
          line.hidden = false;
          line.className = 'velto-fulfil__zone velto-fulfil__zone--bad';
          line.textContent = t.outside;
        } else {
          line.hidden = true;
        }
      } else if (state.method === 'pickup') {
        const pts = this.cfg.pickupPoints || [];
        const host = this.r.place.querySelector('[data-points]');
        const point = (p) => `${esc(p.name)}${p.address ? `<small>${esc(p.address)}</small>` : ''}`;
        if (pts.length === 1) {
          host.innerHTML =
            `<div class="velto-fulfil__label">${esc(t.pickup_label)}</div>` +
            `<div class="velto-fulfil__point"><span class="velto-fulfil__icon" aria-hidden="true">${this.icons.pin || ''}</span><span class="velto-fulfil__method-text">${point(pts[0])}</span></div>`;
        } else if (pts.length) {
          host.innerHTML =
            `<div class="velto-fulfil__label">${esc(t.pickup_label)}</div><div class="velto-fulfil__points" role="radiogroup">` +
            pts
              .map((p) => `<button type="button" class="velto-fulfil__opt" role="radio" aria-checked="${state.pickup === p.name}" data-pickup="${esc(p.name)}"><span class="velto-fulfil__method-text">${point(p)}</span></button>`)
              .join('') +
            '</div>';
        } else {
          host.innerHTML = '';
        }
      }
    }

    renderWhen() {
      const { t, state } = this;
      if (!state.method) {
        this.r.when.innerHTML = '';
        return;
      }
      const days = this.options().days.filter((d) => d[state.method].length);
      if (!days.length) {
        this.r.when.innerHTML = `<p class="velto-fulfil__hint">${esc((this.cfg.days || []).length ? t.closed : t.unavailable)}</p>`;
        return;
      }
      const wd = new Intl.DateTimeFormat(this.cfg.locale, { weekday: 'long', timeZone: 'UTC' });
      const dm = new Intl.DateTimeFormat(this.cfg.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
      let html =
        `<div class="velto-fulfil__label">${esc(t.date_label)}</div><div class="velto-fulfil__chips" role="radiogroup">` +
        days
          .map((d) => {
            const date = new Date(`${d.date}T00:00:00Z`);
            const allFull = d[state.method].every((x) => x.full);
            return `<button type="button" class="velto-fulfil__opt velto-fulfil__chip" role="radio" aria-checked="${state.date === d.date}" data-date="${d.date}"${allFull ? ' disabled' : ''}>${esc(wd.format(date))}<small>${esc(allFull ? t.full : dm.format(date))}</small></button>`;
          })
          .join('') +
        '</div>';
      const day = days.find((d) => d.date === state.date);
      if (day) {
        html +=
          `<div class="velto-fulfil__label">${esc(t.slot_label)}</div><div class="velto-fulfil__chips" role="radiogroup">` +
          day[state.method]
            .map(
              (x) =>
                `<button type="button" class="velto-fulfil__opt velto-fulfil__chip" role="radio" aria-checked="${state.slot === x.slot}" data-slot="${x.slot}"${x.full ? ' disabled' : ''}>${esc(x.slot.replace('-', '–'))}${x.full ? `<small>${esc(t.full)}</small>` : ''}</button>`
            )
            .join('') +
          '</div>';
      }
      this.r.when.innerHTML = html;
    }

    renderNotes() {
      const { t } = this;
      this.r.msg.innerHTML = this.error ? `<p class="velto-fulfil__msg" role="alert">${esc(this.error)}</p>` : '';
      this.classList.toggle('velto-fulfil--date-missing', !!this.error);
      // Customers are told the deadline from theme settings → "Velto piegāde"
      // (e.g. Tuesday 23:59); orders are really accepted a little longer, until
      // the cutoff in velto_delivery_settings (e.g. Wednesday 05:00).
      const cutoff = this.options().cutoff;
      const disp = this.cfg.display || {};
      let shown = cutoff;
      if (disp.weekday >= 1 && disp.weekday <= 7) {
        const [hh, mm] = String(disp.time || '23:59').split(':').map((n) => parseInt(n, 10) || 0);
        const day0 = Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate());
        shown = new Date(day0 - ((isoDow(cutoff) - disp.weekday + 7) % 7) * DAY + (hh * 60 + mm) * 6e4);
        if (shown > cutoff) shown = new Date(shown.getTime() - 7 * DAY);
      }
      const when = new Intl.DateTimeFormat(this.cfg.locale, {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
      }).format(shown);
      const text = shown > this.now() ? t.deadline.replace('[deadline]', when) : t.deadline_soon;
      this.r.deadline.innerHTML = `<p class="velto-fulfil__deadline">${esc(text)}</p>`;
    }

    fail(text) {
      this.error = text;
      this.open = true;
      this.renderSummary();
      this.renderNotes();
      this.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* ---------- events ---------- */
    onClick(e) {
      const s = this.state;
      const opt = e.target.closest('[data-method],[data-date],[data-slot],[data-pickup]');
      const sug = e.target.closest('[data-sug]');
      if (sug) {
        this.pick(Number(sug.dataset.sug));
        return;
      }
      if (e.target.closest('[data-edit]')) {
        this.open = true;
        this.render();
        const first = this.r.methods.querySelector('[aria-checked="true"]');
        if (first) first.focus();
        return;
      }
      if (!opt || opt.disabled) return;
      if (opt.dataset.method) {
        if (s.method === opt.dataset.method) return;
        s.method = opt.dataset.method;
        s.date = '';
        s.slot = '';
      } else if (opt.dataset.date) {
        if (s.date !== opt.dataset.date) s.slot = '';
        s.date = opt.dataset.date;
      } else if (opt.dataset.slot) {
        s.slot = opt.dataset.slot;
        // the time is the last step: fold if nothing else is missing
        if (!this.problem()) this.open = false;
      } else if (opt.dataset.pickup) {
        s.pickup = opt.dataset.pickup;
      }
      this.error = '';
      this.normalize();
      this.render();
      this.reconcile();
    }

    onInput(e) {
      if (e.target.matches('[data-comment]')) {
        this.state.comment = e.target.value.replace(/\s+/g, ' ').trim();
        clearTimeout(this.commentTimer);
        this.commentTimer = setTimeout(() => this.reconcile(), 600);
        return;
      }
      if (e.target.matches('[data-contact]')) {
        this.state.contact = e.target.value.trim();
        try {
          localStorage.setItem(CONTACT_KEY, this.state.contact);
        } catch (err) {
          /* private mode: the cart attribute is enough */
        }
        if (this.error) {
          this.error = '';
          this.renderNotes();
        }
        clearTimeout(this.contactTimer);
        this.contactTimer = setTimeout(() => this.reconcile(), 600);
        return;
      }
      if (!e.target.matches('[data-address]')) return;
      const q = e.target.value.trim();
      // an address counts only when it is picked from the list
      if (this.state.coords || this.state.address) {
        this.state.coords = '';
        this.state.address = '';
        this.renderPlace();
        this.reconcile();
      }
      clearTimeout(this.sugTimer);
      this.sugTimer = setTimeout(() => this.suggest(q), 250);
    }

    onKeydown(e) {
      if (!e.target.matches('[data-address]')) return;
      const list = this.r.place.querySelector('[role="listbox"]');
      const open = list && !list.hidden && this.sugs.length;
      if (e.key === 'Enter') {
        e.preventDefault(); // never submit the cart form from this field
        if (open) this.pick(Math.max(0, this.active));
      } else if (e.key === 'Escape') {
        this.hideList();
      } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const n = this.sugs.length;
        this.active = e.key === 'ArrowDown' ? (this.active + 1) % n : this.active <= 0 ? n - 1 : this.active - 1;
        list.querySelectorAll('[data-sug]').forEach((li, i) => li.setAttribute('aria-selected', i === this.active));
      }
    }

    /* ---------- address search (Google Places) ---------- */
    maps() {
      if (!this.cfg.mapsKey) return Promise.resolve(null);
      if (!this.mapsPromise) {
        this.mapsPromise = new Promise((resolve) => {
          if (window.google && google.maps && google.maps.importLibrary) return resolve(google.maps.importLibrary('places'));
          const cb = `__veltoMaps${Date.now()}`;
          window[cb] = () => resolve(google.maps.importLibrary('places'));
          const s = document.createElement('script');
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.cfg.mapsKey)}&loading=async&language=${encodeURIComponent(this.cfg.locale)}&region=LV&callback=${cb}`;
          s.async = true;
          s.onerror = () => resolve(null);
          document.head.appendChild(s);
        }).catch(() => null);
      }
      return this.mapsPromise;
    }

    async suggest(q) {
      const seq = (this.sugSeq = (this.sugSeq || 0) + 1);
      // "56.95, 24.10" — coordinates typed by hand (testing without Google)
      const typed = parseCoords(q);
      if (typed) {
        this.sugs = [{ coords: typed, text: q }];
        return this.showList();
      }
      if (q.length < 3) return this.hideList();
      const lib = await this.maps();
      if (seq !== this.sugSeq) return;
      if (!lib) return this.showList(this.t.maps_missing);
      try {
        if (!this.session) this.session = new lib.AutocompleteSessionToken();
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: this.session,
          includedRegionCodes: ['lv'],
          language: this.cfg.locale,
        });
        if (seq !== this.sugSeq) return;
        this.sugs = (suggestions || [])
          .filter((x) => x.placePrediction)
          .slice(0, 5)
          .map((x) => ({ prediction: x.placePrediction, text: x.placePrediction.text.toString() }));
        this.showList(this.sugs.length ? '' : this.t.address_none);
      } catch (err) {
        console.error('[velto-fulfil] places', err);
        if (seq === this.sugSeq) this.showList(this.t.maps_missing);
      }
    }

    showList(note) {
      const list = this.r.place.querySelector('[role="listbox"]');
      const input = this.r.place.querySelector('[data-address]');
      if (!list) return;
      this.active = -1;
      if (note) this.sugs = [];
      list.innerHTML = note
        ? `<li aria-disabled="true">${esc(note)}</li>`
        : this.sugs.map((x, i) => `<li role="option" data-sug="${i}" aria-selected="false">${esc(x.text)}</li>`).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    hideList() {
      const list = this.r.place.querySelector('[role="listbox"]');
      const input = this.r.place.querySelector('[data-address]');
      if (!list) return;
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }

    async pick(i) {
      const x = this.sugs[i];
      if (!x) return;
      const input = this.r.place.querySelector('[data-address]');
      this.hideList();
      let coords = x.coords;
      let address = x.text;
      if (x.prediction) {
        try {
          const place = x.prediction.toPlace();
          await place.fetchFields({ fields: ['formattedAddress', 'location'] });
          this.session = null; // the session ends with the details request
          if (place.location) coords = { lat: place.location.lat(), lng: place.location.lng() };
          address = place.formattedAddress || address;
        } catch (err) {
          console.error('[velto-fulfil] place', err);
        }
      }
      if (!coords) return;
      this.state.address = address;
      this.state.coords = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;
      if (input) input.value = address;
      this.error = '';
      this.render();
      this.reconcile();
    }

    /* ---------- worker: how full the slots are ---------- */
    async loadAvailability() {
      if (!this.cfg.worker) return;
      try {
        const res = await fetch(`${this.cfg.worker.replace(/\/+$/, '')}/v1/availability`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data && data.booked) this.booked = data.booked;
        if (data && data.now) this.skew = data.now - Date.now();
        this.tick();
      } catch (e) {
        /* no occupancy data: all slots stay open */
      }
    }

    tick() {
      if (this.normalize()) this.reconcile();
      this.renderSummary();
      this.renderWhen();
      this.renderNotes();
    }

    /* ---------- cart ---------- */
    async refreshCart() {
      try {
        this.cart = await fetch(`${this.cfg.routes.cart}.js`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      } catch (e) {
        /* keep the last known cart */
      }
      if (this.normalize()) this.render();
      else {
        this.renderSummary();
        this.renderMethods();
      }
    }

    desired() {
      const s = this.state;
      const zone = s.method === 'delivery' ? this.zone : null;
      const attributes = {
        [ATTR.method]: s.method,
        [ATTR.date]: s.method ? s.date : '',
        [ATTR.slot]: s.method ? s.slot : '',
        [ATTR.zone]: zone ? zone.name : '',
        [ATTR.address]: s.method === 'delivery' ? s.address : '',
        [ATTR.coords]: s.method === 'delivery' ? s.coords : '',
        [ATTR.pickup]: s.method === 'pickup' ? s.pickup : '',
        [ATTR.pickupAddress]: s.method === 'pickup' && this.point ? this.point.address || '' : '',
        [ATTR.contact]: s.contact,
        [ATTR.comment]: s.comment,
        [ATTR.lang]: s.method ? this.cfg.locale : '',
      };
      const g = this.goods;
      const line = zone && zone.variant && g > 0 && !this.belowMin() ? Number(zone.variant) : null;
      return { attributes, line, note: this.note(zone) };
    }

    /* The choice as one short line in the order note, so it is visible right in
       the orders list: "22.11.2026, 18:00–19:00 pickup: VELTO" or
       "21.11.2026, 12:00–15:00 delivery: <zone>", plus the customer's own
       order note on a second line, if any. The details (address, phone) are
       in the order attributes. Only while the theme's own "order note"
       field is off: otherwise the note belongs to the customer. */
    note(zone) {
      const s = this.state;
      if (!this.cfg.writeNote) return null;
      if (!s.method) return '';
      const parts = [];
      if (s.date) {
        const [y, m, day] = s.date.split('-');
        parts.push(`${day}.${m}.${y}${s.slot ? `, ${s.slot.replace('-', '–')}` : ''}`);
      }
      const where = s.method === 'delivery' ? (zone ? zone.name : '') : s.pickup;
      parts.push(`${s.method}${where ? `: ${where}` : ''}`);
      const line = parts.join(' ');
      // the customer's own note goes on a second line
      return s.comment ? `${line}\n${s.comment}` : line;
    }

    /* bring the cart in line with the choice; does nothing when it already is */
    reconcile() {
      this.saving = (this.saving || Promise.resolve()).then(() => this.save()).catch((e) => console.error('[velto-fulfil] save', e));
      return this.saving;
    }

    async save() {
      if (!this.cart) return;
      const want = this.desired();
      const have = this.cart.attributes || {};
      const attrsDiffer = Object.keys(want.attributes).some((k) => (have[k] || '') !== want.attributes[k]);
      const lines = this.cart.items.filter((i) => this.isDelivery(i));
      const linesOk = want.line
        ? lines.length === 1 && lines[0].variant_id === want.line && lines[0].quantity === 1
        : lines.length === 0;
      const noteDiffers = want.note !== null && (this.cart.note || '') !== want.note;
      if (!attrsDiffer && linesOk && !noteDiffers) return;

      const body = { attributes: want.attributes };
      if (noteDiffers) body.note = want.note;
      if (!linesOk) {
        body.updates = {};
        lines.forEach((i) => (body.updates[i.variant_id] = 0));
        if (want.line) body.updates[want.line] = 1;
      }
      const res = await fetch(`${this.cfg.routes.update}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const cart = await res.json();
      if (!res.ok || !cart || !cart.items) throw new Error(`cart update ${res.status}`);
      this.cart = cart;
      // totals and the "Piegāde" row are rendered by the server
      const items = document.querySelector('cart-items');
      if (items && typeof items.refreshSections === 'function') items.refreshSections();
    }

    /* ---------- checkout ---------- */
    problem() {
      const { t, state: s } = this;
      if (!s.method) return t.err_method;
      if (s.method === 'delivery') {
        if (this.belowMin()) return t.err_min.replace('[amount]', this.money(this.min));
        if (!s.coords) return t.err_address;
        if (!this.zone) return t.outside;
      }
      if (s.method === 'pickup' && (this.cfg.pickupPoints || []).length && !s.pickup) return t.err_pickup;
      if (!s.date) return t.err_date;
      if (!s.slot) return t.err_slot;
      if (s.contact.replace(/\D/g, '').length < 8) return t.err_contact;
      return '';
    }

    onCheckoutClick(e) {
      const btn = e.target.closest && e.target.closest('[name="checkout"]');
      if (!btn) return;
      if (this.pass) {
        this.pass = false;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (this.checking) return;
      this.checking = true;
      this.classList.add('velto-fulfil--busy');
      this.tryCheckout(btn).finally(() => {
        this.checking = false;
        this.classList.remove('velto-fulfil--busy');
      });
    }

    async tryCheckout(btn) {
      let problem = this.problem();
      if (problem) return this.fail(problem);

      await this.refreshCart();
      this.normalize();
      await this.reconcile();
      problem = this.problem();
      if (problem) {
        this.render();
        return this.fail(problem);
      }

      if (this.cfg.worker) {
        try {
          const s = this.state;
          const res = await fetch(`${this.cfg.worker.replace(/\/+$/, '')}/v1/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: s.method, date: s.date, slot: s.slot }),
            signal: AbortSignal.timeout(4000),
          });
          const data = await res.json();
          if (res.ok && data && data.ok === false) {
            await this.loadAvailability();
            if (data.reason === 'full') {
              this.booked[slotKey(s.date, s.method, s.slot)] = Infinity;
              this.normalize();
            } else {
              s.date = '';
              s.slot = '';
            }
            this.render();
            this.reconcile();
            return this.fail(data.reason === 'full' ? this.t.err_full : this.t.err_cycle);
          }
        } catch (err) {
          /* the worker is unreachable: let the customer order */
        }
      }

      this.error = '';
      this.renderNotes();
      this.pass = true;
      btn.click();
    }
  }

  customElements.define('velto-fulfil', VeltoFulfil);
})();
