/* Velto — "Mani pirkumi" page (sections/velto-mine.liquid).
   Data: the logged-in customer's orders rendered by Liquid (JSON; guests are
   sent to sign-in). Renders: last order + reorder, the period the data covers,
   stat tiles, insights (most bought, categories, spend by month), order
   history and the "buy again" list with the card quantity stepper. */
(() => {
  if (customElements.get('velto-mine')) return;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ICON_REORDER =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.4L16.5 7.5"/><path d="M16.5 3.5v4h-4"/><path d="M16.5 10a6.5 6.5 0 0 1-11.3 4.4L3.5 12.5"/><path d="M3.5 16.5v-4h4"/></svg>';

  class VeltoMine extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      const go = () => this.init().catch((e) => console.error('[velto-mine]', e));
      if (window.veltoCart) go();
      else document.addEventListener('DOMContentLoaded', go, { once: true });
    }

    async init() {
      const raw = this.querySelector('[data-mine-data]').textContent;
      let d;
      try {
        d = JSON.parse(raw);
      } catch (e) {
        // never lose the orders because of one malformed field
        console.error('[velto-mine] data', e);
        d = JSON.parse(raw.replace(/"cats":\s*\{[\s\S]*?\},\s*"s":/, '"cats": {}, "s":'));
      }
      const C = window.veltoCart || {};
      this.C = C;
      this.S = Object.assign({}, C.S || {}, d.s);
      this.lang = (d.s.lang || document.documentElement.lang || 'lv').split('-')[0];
      this.root = (d.root || '/').replace(/\/$/, '');
      this.money = C.money || ((c) => (c / 100).toFixed(2).replace('.', ',') + ' €');
      this.variants = d.variants || {};
      this.cats = d.cats || {};
      const orders = (d.orders || []).map((o) => Object.assign(o, { date: new Date(o.d) }));
      orders.sort((a, b) => b.date - a.date);
      this.orders = orders;
      this.valid = orders.filter((o) => !o.x);

      if (!this.valid.length) {
        this.slot('empty').hidden = false;
        return;
      }

      this.aggregate();
      this.renderLast();
      this.renderPeriod(orders.length >= 50);
      this.renderStats();
      if (this.valid.length >= 2) this.renderInsights();
      this.renderAgain();
      this.renderHistory();
      if (C.refresh) C.refresh();
    }

    slot(name) {
      return this.querySelector(`[data-slot="${name}"]`);
    }

    url(u) {
      if (!u) return '#';
      if (this.root && u.startsWith('/') && !u.startsWith(this.root + '/')) return this.root + u;
      return u;
    }

    fmtDate(date, withYear) {
      const opts = { day: 'numeric', month: 'short' };
      if (withYear || date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
      try {
        return new Intl.DateTimeFormat(this.lang, opts).format(date);
      } catch (e) {
        return date.toLocaleDateString();
      }
    }

    itemsLabel(n) {
      return this.C.itemsLabel ? this.C.itemsLabel(n) : String(n);
    }

    aggregate() {
      const agg = {};
      this.valid.forEach((o) => {
        const inOrder = new Set();
        o.i.forEach((li) => {
          if (!li.v) return;
          const a = (agg[li.v] = agg[li.v] || { v: li.v, times: 0, qty: 0, spend: 0, last: null, t: li.t, img: li.img });
          if (!inOrder.has(li.v)) {
            a.times++;
            inOrder.add(li.v);
          }
          a.qty += li.q;
          a.spend += li.p * li.q;
          if (!a.last || o.date > a.last) a.last = o.date;
        });
      });
      this.items = Object.values(agg);
    }

    /* ---------- reorder ---------- */
    plan(order) {
      const merged = {};
      let skipped = 0;
      order.i.forEach((li) => {
        const v = this.variants[li.v];
        if (!v || !v.a) return skipped++;
        const min = v.min || 1;
        const st = v.st || 1;
        let q = Math.max(li.q, min);
        q = min + Math.ceil((q - min) / st) * st;
        if (v.max != null && q > v.max) q = v.max >= min ? min + Math.floor((v.max - min) / st) * st : 0;
        if (q <= 0) return skipped++;
        merged[li.v] = (merged[li.v] || 0) + q;
      });
      return { items: Object.entries(merged).map(([id, quantity]) => ({ id: Number(id), quantity })), skipped };
    }

    post(items) {
      const url = `${(window.routes && window.routes.cart_add_url) || '/cart/add'}.js`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items, sections: 'cart-icon-bubble', sections_url: location.pathname }),
      }).then((r) => r.json().then((j) => ({ ok: r.ok && !j.status, j })));
    }

    async reorder(order, btn) {
      const { items, skipped: s0 } = this.plan(order);
      const toast = this.C.toast || (() => {});
      if (!items.length) return toast(this.S.none_available, null, true);
      let skipped = s0;
      btn.classList.add('is-busy');
      btn.disabled = true;
      try {
        let res = await this.post(items);
        if (!res.ok) {
          // one line failed (stock changed) — add the rest one by one
          let last = null;
          for (const it of items) {
            const r = await this.post([it]);
            if (r.ok) last = r;
            else skipped++;
          }
          res = last;
        }
        if (res && this.C.renderBubble) this.C.renderBubble(res.j.sections);
        const cart = this.C.refresh ? await this.C.refresh() : null;
        if (!res) toast(this.S.none_available, null, true);
        else toast(skipped ? this.S.added_partial.replace('[count]', skipped) : this.S.added || '✓', cart || null);
      } catch (e) {
        toast(this.S.error || 'Error', null, true);
      }
      btn.classList.remove('is-busy');
      btn.disabled = false;
    }

    reorderBtn(order, label, cls = '') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'velto-mine__btn ' + cls;
      b.innerHTML = `${ICON_REORDER}<span>${esc(label)}</span>`;
      b.addEventListener('click', () => this.reorder(order, b));
      return b;
    }

    thumbs(order, n) {
      const imgs = order.i.map((li) => (this.variants[li.v] && this.variants[li.v].img) || li.img);
      const shown = imgs.slice(0, n);
      return (
        shown.map((src) => (src ? `<span><img src="${esc(src)}" alt="" loading="lazy" width="80" height="80"></span>` : '<span></span>')).join('') +
        (imgs.length > n ? `<span class="is-more">+${imgs.length - n}</span>` : '')
      );
    }

    orderQty(order) {
      return order.i.reduce((s, li) => s + li.q, 0);
    }

    /* ---------- last order ---------- */
    renderLast() {
      const o = this.valid[0];
      const el = this.slot('last');
      el.innerHTML = `
        <p class="velto-mine__label">${esc(this.S.last_order)} · ${esc(this.fmtDate(o.date))}</p>
        <div class="velto-mine__thumbs">${this.thumbs(o, 5)}</div>
        <p class="velto-mine__last-meta">${esc(this.itemsLabel(this.orderQty(o)))}${o.t ? ' · ' + esc(this.money(o.t)) : ''}</p>`;
      el.appendChild(this.reorderBtn(o, this.S.reorder, 'velto-mine__btn--wide'));
      el.hidden = false;
    }

    /* ---------- the period the numbers cover ---------- */
    renderPeriod(capped) {
      const v = this.valid;
      const el = this.slot('period');
      const from = this.fmtDate(v[v.length - 1].date, true);
      const to = this.fmtDate(v[0].date, true);
      el.innerHTML =
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke-linecap="round"/></svg>' +
        `<span>${esc(this.S.period.replace('[from]', from).replace('[to]', to).replace('[count]', v.length))}${
          capped ? ' · ' + esc(this.S.period_cap) : ''
        }</span>`;
      el.hidden = false;
    }

    /* ---------- stats ---------- */
    renderStats() {
      const v = this.valid;
      const spent = v.reduce((s, o) => s + (o.t || 0), 0);
      const qty = v.reduce((s, o) => s + this.orderQty(o), 0);
      const first = v[v.length - 1].date;
      const days = Math.max(0, Math.round((Date.now() - v[0].date) / 864e5));
      let rel;
      try {
        rel = new Intl.RelativeTimeFormat(this.lang, { numeric: 'auto' }).format(-days, 'day');
      } catch (e) {
        rel = this.fmtDate(v[0].date);
      }
      let since;
      try {
        since = new Intl.DateTimeFormat(this.lang, { month: 'long', year: 'numeric' }).format(first);
      } catch (e) {
        since = first.getFullYear();
      }
      const tile = (label, value, sub) =>
        `<div class="velto-mine__stat"><p class="velto-mine__label">${esc(label)}</p><p class="velto-mine__stat-v">${esc(value)}</p><p class="velto-mine__stat-sub">${esc(sub)}</p></div>`;
      const el = this.slot('stats');
      el.innerHTML =
        tile(this.S.stat_orders, v.length, this.S.stat_since.replace('[date]', since)) +
        tile(this.S.stat_spent, this.money(spent), this.S.stat_avg.replace('[amount]', this.money(Math.round(spent / v.length)))) +
        tile(this.S.stat_items, qty, this.S.distinct.replace('[count]', this.items.length)) +
        tile(this.S.last_order, rel, this.fmtDate(v[0].date, true));
      el.hidden = false;
    }

    /* ---------- insights ---------- */
    renderInsights() {
      const cards = [];

      // most bought — in how many orders the item was
      const top = this.items
        .slice()
        .sort((a, b) => b.times - a.times || b.qty - a.qty)
        .filter((a) => a.times > 1)
        .slice(0, 5);
      if (top.length) {
        const max = top[0].times;
        cards.push(`
          <div class="velto-mine__card">
            <h2 class="velto-mine__h3">${esc(this.S.top_heading)}</h2>
            <p class="velto-mine__muted">${esc(this.S.top_hint)}</p>
            <ol class="velto-mine__bars" role="list">
              ${top
                .map((a) => {
                  const v = this.variants[a.v] || {};
                  const img = v.img || a.img;
                  return `<li>
                    <a class="velto-mine__bar-row" href="${esc(this.url(v.u))}">
                      <span class="velto-mine__bar-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy" width="80" height="80">` : ''}</span>
                      <span class="velto-mine__bar-body">
                        <span class="velto-mine__bar-name">${esc(v.t || a.t)}</span>
                        <span class="velto-mine__bar-track"><span style="width:${Math.max(6, (a.times / max) * 100)}%"></span></span>
                      </span>
                      <span class="velto-mine__bar-val">${a.times}×</span>
                    </a>
                  </li>`;
                })
                .join('')}
            </ol>
          </div>`);
      }

      // categories — share of items bought
      const byCat = {};
      let total = 0;
      this.items.forEach((a) => {
        const v = this.variants[a.v];
        const c = (v && this.cats[v.pid]) || null;
        if (!c) return;
        byCat[c] = (byCat[c] || 0) + a.qty;
        total += a.qty;
      });
      let catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      if (catRows.length >= 2) {
        if (catRows.length > 5) {
          const rest = catRows.slice(4).reduce((s, r) => s + r[1], 0);
          catRows = catRows.slice(0, 4).concat([[this.S.other, rest]]);
        }
        const max = Math.max(...catRows.map((r) => r[1]));
        cards.push(`
          <div class="velto-mine__card">
            <h2 class="velto-mine__h3">${esc(this.S.cat_heading)}</h2>
            <p class="velto-mine__muted">${esc(this.S.cat_hint)}</p>
            <ul class="velto-mine__bars velto-mine__bars--cats" role="list">
              ${catRows
                .map(
                  ([name, q]) => `<li class="velto-mine__bar-row">
                    <span class="velto-mine__bar-body">
                      <span class="velto-mine__bar-name">${esc(name)}</span>
                      <span class="velto-mine__bar-track"><span style="width:${Math.max(4, (q / max) * 100)}%"></span></span>
                    </span>
                    <span class="velto-mine__bar-val">${Math.round((q / total) * 100)}%</span>
                  </li>`
                )
                .join('')}
            </ul>
          </div>`);
      }

      // spend by month — last 6 months
      const now = new Date();
      const months = [];
      for (let k = 5; k >= 0; k--) months.push(new Date(now.getFullYear(), now.getMonth() - k, 1));
      const sums = months.map((m) =>
        this.valid
          .filter((o) => o.date.getFullYear() === m.getFullYear() && o.date.getMonth() === m.getMonth())
          .reduce((s, o) => s + (o.t || 0), 0)
      );
      if (sums.filter(Boolean).length >= 2) {
        const max = Math.max(...sums);
        let mf;
        try {
          mf = new Intl.DateTimeFormat(this.lang, { month: 'short' });
        } catch (e) {
          mf = { format: (d) => d.getMonth() + 1 };
        }
        cards.push(`
          <div class="velto-mine__card">
            <h2 class="velto-mine__h3">${esc(this.S.month_heading)}</h2>
            <p class="velto-mine__muted">${esc(this.S.month_hint)}</p>
            <div class="velto-mine__cols" role="list">
              ${months
                .map((m, k) => {
                  const val = this.money(sums[k]);
                  const label = `${mf.format(m)}: ${val}`;
                  return `<div class="velto-mine__col${k === 5 ? ' is-now' : ''}" role="listitem" tabindex="0" aria-label="${esc(label)}" data-tip="${esc(val)}">
                    <span class="velto-mine__col-bar" style="height:${sums[k] ? Math.max(4, (sums[k] / max) * 100) : 0}%"></span>
                    <span class="velto-mine__col-m">${esc(mf.format(m))}</span>
                  </div>`;
                })
                .join('')}
            </div>
          </div>`);
      }

      if (!cards.length) return;
      const el = this.slot('insights');
      el.innerHTML = cards.join('');
      el.dataset.count = cards.length;
      el.hidden = false;
    }

    /* ---------- buy again ---------- */
    renderAgain() {
      const el = this.slot('again');
      const list = el.querySelector('[data-rows]');
      const more = el.querySelector('[data-more]');
      const none = el.querySelector('[data-none]');
      const input = el.querySelector('[data-filter]');
      const tpl = this.querySelector('template[data-qa-tpl]');
      const PAGE = 24;
      let sort = 'freq';
      let shown = PAGE;

      const rows = this.items.map((a) => {
        const v = this.variants[a.v];
        const li = document.createElement('li');
        li.className = 'velto-mine__row' + (v && v.a ? '' : ' is-off');
        const title = (v && v.t) || a.t;
        const vt = v && v.vt ? `<span class="velto-mine__row-vt">${esc(v.vt)}</span>` : '';
        const img = (v && v.img) || a.img;
        const href = esc(this.url(v && v.u));
        const meta = this.S.bought_meta.replace('[count]', a.times).replace('[date]', this.fmtDate(a.last));
        li.innerHTML = `
          <a class="velto-mine__row-img" href="${href}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" loading="lazy" width="80" height="80">` : ''}</a>
          <div class="velto-mine__row-main">
            <a class="velto-mine__row-title" href="${href}">${esc(title)}${vt}</a>
            <p class="velto-mine__row-meta">${esc(meta)}</p>
            ${
              v
                ? `<p class="velto-mine__row-price"><strong>${esc(this.money(v.pr))}</strong>${
                    v.cp > v.pr ? ` <s>${esc(this.money(v.cp))}</s>` : ''
                  }${v.up ? ` <small>${esc(v.up)}</small>` : ''}</p>`
                : ''
            }
          </div>
          <div class="velto-mine__row-qa"></div>`;
        const slot = li.querySelector('.velto-mine__row-qa');
        if (v && v.a && tpl) {
          const qa = tpl.content.firstElementChild.cloneNode(true);
          qa.dataset.variant = a.v;
          qa.dataset.min = v.min || 1;
          qa.dataset.step = v.st || 1;
          if (v.max != null) qa.dataset.max = v.max;
          qa.dataset.title = title;
          const add = qa.querySelector('[data-qa="add"]');
          if (add) add.setAttribute('aria-label', (add.getAttribute('aria-label') || '').replace('[title]', title));
          slot.appendChild(qa);
        } else {
          slot.innerHTML = `<span class="velto-mine__off">${esc(this.S.unavailable)}</span>`;
        }
        return { a, li, title, key: (title + ' ' + ((v && v.vt) || '')).toLowerCase() };
      });

      const sorters = {
        freq: (x, y) => y.a.times - x.a.times || y.a.qty - x.a.qty || y.a.last - x.a.last,
        recent: (x, y) => y.a.last - x.a.last || y.a.times - x.a.times,
        az: (x, y) => x.title.localeCompare(y.title, this.lang),
      };

      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const avail = (r) => (this.variants[r.a.v] && this.variants[r.a.v].a ? 0 : 1);
        const list2 = rows
          .filter((r) => !q || r.key.includes(q))
          .sort((x, y) => avail(x) - avail(y) || sorters[sort](x, y));
        list.replaceChildren(...list2.slice(0, shown).map((r) => r.li));
        more.hidden = list2.length <= shown;
        none.hidden = list2.length > 0;
      };

      el.querySelectorAll('[data-sort]').forEach((b) =>
        b.addEventListener('click', () => {
          sort = b.dataset.sort;
          el.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('is-active', x === b));
          draw();
        })
      );
      input.addEventListener('input', () => {
        shown = PAGE;
        draw();
      });
      more.addEventListener('click', () => {
        shown += PAGE;
        draw();
      });
      draw();
      el.hidden = false;
    }

    /* ---------- history ---------- */
    renderHistory() {
      const el = this.slot('history');
      const list = el.querySelector('[data-orders]');
      const PAGE = 6;
      let shown = PAGE;
      const items = this.orders.map((o) => {
        const li = document.createElement('li');
        li.className = 'velto-mine__order' + (o.x ? ' is-cancelled' : '');
        li.innerHTML = `
          <div class="velto-mine__order-head">
            <strong>${esc(o.n)}</strong>
            <span>${esc(this.fmtDate(o.date, true))}</span>
            ${o.x ? `<em>${esc(this.S.cancelled)}</em>` : ''}
          </div>
          <div class="velto-mine__thumbs velto-mine__thumbs--sm">${this.thumbs(o, 6)}</div>
          <div class="velto-mine__order-foot">
            <span>${esc(this.itemsLabel(this.orderQty(o)))}${o.t ? ' · <strong>' + esc(this.money(o.t)) + '</strong>' : ''}</span>
            <div class="velto-mine__order-actions"></div>
          </div>`;
        const act = li.querySelector('.velto-mine__order-actions');
        if (o.u) {
          const a = document.createElement('a');
          a.className = 'velto-mine__link';
          a.href = o.u;
          a.textContent = this.S.details;
          act.appendChild(a);
        }
        act.appendChild(this.reorderBtn(o, this.S.reorder_short, 'velto-mine__btn--ghost'));
        return li;
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'velto-mine__more';
      btn.textContent = this.S.show_more || '+';
      btn.addEventListener('click', () => {
        shown += PAGE;
        draw();
      });
      const draw = () => {
        list.replaceChildren(...items.slice(0, shown));
        btn.hidden = items.length <= shown;
      };
      el.appendChild(btn);
      draw();
      el.hidden = false;
    }
  }

  customElements.define('velto-mine', VeltoMine);
})();
