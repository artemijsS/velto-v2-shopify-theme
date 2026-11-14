/* Velto — own fees (replaces the Upcharge Fees app).

   The fees are lines of hidden products of type "velto_fee" (Theme settings →
   "Velto: savas maksas"); this script keeps them in line with the goods in the cart:
     Depozīts       quantity = deposit containers in the cart
     Maisiņa maksa  quantity = bags: one per reached step of the goods total
     Iepakošana     1 while the goods total is below the free-packaging amount
   Fee lines the Upcharge Fees app left in an older cart are removed.

   What the cart holds is computed by Liquid (snippets/velto-fees-state.liquid):
   inline on page load, so a cart that is already right costs no request, and
   through the section "velto-fees-state" after every cart change.
   While a check is running the checkout buttons wait (html.velto-fees-busy,
   velto-ui.css). On the cart page cart.js re-renders on "velto:fees:updated". */
(() => {
  const SECTION = 'velto-fees-state';
  const root = document.documentElement;
  const base = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';

  const read = (el) => {
    try {
      return el ? JSON.parse(el.textContent) : null;
    } catch (e) {
      return null;
    }
  };

  const fetchState = async () => {
    const res = await fetch(`${base}?sections=${SECTION}`, { headers: { Accept: 'application/json' } });
    const html = (await res.json())[SECTION];
    return read(new DOMParser().parseFromString(html || '', 'text/html').querySelector('[data-velto-fees-state]'));
  };

  /* variant id → quantity the cart should hold */
  const wanted = (s) => {
    const { cfg, goods } = s;
    const want = new Map();
    const has = goods > 0;
    if (cfg.deposit) want.set(cfg.deposit, has ? s.deposits : 0);
    if (cfg.bag) {
      const steps = String(cfg.bagSteps || '')
        .split(/[;,\s]+/)
        .map((x) => Math.round(parseFloat(x) * 100))
        .filter((x) => x >= 0);
      want.set(cfg.bag, has ? steps.filter((x) => goods >= x).length : 0);
    }
    if (cfg.pack) want.set(cfg.pack, has && cfg.packBelow > 0 && goods < cfg.packBelow ? 1 : 0);
    return want;
  };

  /* body for /cart/update.js, or null when the cart is already right */
  const plan = (s) => {
    const want = wanted(s);
    const updates = {};
    const seen = new Set();
    (s.lines || []).forEach((l) => {
      // a line of the old app, of a fee that is no longer configured, or a duplicate
      if (!l.own || !want.has(l.id) || seen.has(l.id)) {
        updates[l.key] = 0;
        return;
      }
      seen.add(l.id);
      if (l.qty !== want.get(l.id)) updates[l.key] = want.get(l.id);
    });
    want.forEach((qty, id) => {
      if (!seen.has(id) && qty > 0) updates[id] = qty;
    });
    return Object.keys(updates).length ? updates : null;
  };

  let pending = 0; // checks asked for and not finished
  let chain = Promise.resolve();
  let applied = []; // times of our cart updates: a guard against fighting another script
  let timer;

  const busy = (on) => {
    pending += on ? 1 : -1;
    root.classList.toggle('velto-fees-busy', pending > 0);
  };

  const run = async (state) => {
    const s = state || (await fetchState());
    if (!s || !s.cfg) return;
    const updates = plan(s);
    if (!updates) return;
    const now = Date.now();
    applied = applied.filter((t) => now - t < 15000);
    if (applied.length >= 6) {
      console.error('[velto-fees] the fee lines keep changing — is the Upcharge Fees app embed still on?');
      return;
    }
    applied.push(now);
    const res = await fetch(`${(window.routes && window.routes.cart_update_url) || '/cart/update'}.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (!res.ok) throw new Error(`cart update ${res.status}`);
    document.dispatchEvent(new CustomEvent('velto:fees:updated', { detail: await res.json() }));
  };

  const sync = (state) => {
    busy(true);
    chain = chain
      .then(() => run(state))
      .catch((e) => console.error('[velto-fees]', e))
      .finally(() => busy(false));
    return chain;
  };

  const queue = () => {
    if (!timer) busy(true); // checkout waits from the moment the cart changed
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      sync().finally(() => busy(false));
    }, 150);
  };

  // no checkout while the fees are being brought in line (keyboard included)
  document.addEventListener(
    'click',
    (e) => {
      if (pending > 0 && e.target.closest && e.target.closest('[name="checkout"], [data-velto-checkout]')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, queue);
  }
  // back/forward cache: the inline state is from the first visit
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) queue();
  });

  const inline = read(document.getElementById('VeltoFeesState'));
  if (inline) sync(inline);
  else queue();
})();
