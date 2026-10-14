/* Velto — "smart fit" for product photos in cards.
   Supplier packshots often have wide white margins (the product can fill only
   20–60 % of the photo), so in a card it looked tiny. For every card image we
   find the product's bounding box on a small 160 px copy (canvas), then scale
   and centre the photo so the product fills ~82 % of the square (max 2.2×,
   min 0.8×). Nothing changes in Shopify — only how the photo is shown.
   Results are cached per image in localStorage; images are processed when they
   come near the viewport; cards added later (load more, rails, filters) too. */
(() => {
  if (window.veltoFit) return;

  const SEL = [
    '.card-wrapper .card__media .media img',
    '.velto-mine__thumbs img',
    '.velto-mine__row-img img',
    '.velto-mine__bar-img img',
  ].join(',');
  const FILL = 0.82;
  const MAX = 2.2;
  const MIN = 0.8;
  const KEY = 'velto:fit:v1';

  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) {}
  let saveTimer;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const keys = Object.keys(cache);
        if (keys.length > 2000) keys.slice(0, keys.length - 1500).forEach((k) => delete cache[k]);
        localStorage.setItem(KEY, JSON.stringify(cache));
      } catch (e) {}
    }, 800);
  };

  const srcOf = (img) => img.currentSrc || img.getAttribute('src') || (img.getAttribute('srcset') || '').split(' ')[0];
  const keyOf = (src) => {
    try {
      return new URL(src, location.href).pathname;
    } catch (e) {
      return String(src).split('?')[0];
    }
  };

  /* bounding box of everything that isn't (near-)white or transparent:
     [x, y, w, h] as fractions of the photo + its aspect ratio */
  const analyse = (src) =>
    new Promise((resolve) => {
      let u;
      try {
        u = new URL(src, location.href);
      } catch (e) {
        return resolve(null);
      }
      u.searchParams.set('width', '160');
      u.searchParams.delete('height');
      u.searchParams.delete('crop');
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.decoding = 'async';
      i.onload = () => {
        try {
          const w = i.naturalWidth;
          const h = i.naturalHeight;
          if (!w || !h) return resolve(null);
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(i, 0, 0);
          const d = x.getImageData(0, 0, w, h).data;
          let a = w, b = h, e = -1, f = -1;
          for (let y = 0; y < h; y++) {
            for (let xx = 0; xx < w; xx++) {
              const k = (y * w + xx) * 4;
              if (d[k + 3] > 16 && (d[k] < 238 || d[k + 1] < 238 || d[k + 2] < 238)) {
                if (xx < a) a = xx;
                if (xx > e) e = xx;
                if (y < b) b = y;
                if (y > f) f = y;
              }
            }
          }
          if (e < 0) return resolve(null);
          const r = (n) => Math.round(n * 1000) / 1000;
          resolve([r(a / w), r(b / h), r((e - a + 1) / w), r((f - b + 1) / h), r(w / h)]);
        } catch (err) {
          resolve(null); // no CORS for this image — leave it as it is
        }
      };
      i.onerror = () => resolve(null);
      i.src = u.toString();
    });

  const apply = (img, bb) => {
    if (!bb) {
      img.dataset.fit = 'none';
      return;
    }
    const [bx, by, bw, bh, ar] = bb;
    // the photo is shown with object-fit: contain inside a square
    const dw = ar >= 1 ? 1 : ar;
    const dh = ar >= 1 ? 1 / ar : 1;
    const x0 = (1 - dw) / 2 + bx * dw;
    const y0 = (1 - dh) / 2 + by * dh;
    const w = bw * dw;
    const h = bh * dh;
    const s = Math.max(MIN, Math.min(MAX, FILL / Math.max(w, h, 0.01)));
    const tx = -s * (x0 + w / 2 - 0.5) * 100;
    const ty = -s * (y0 + h / 2 - 0.5) * 100;
    img.style.setProperty('--fit', `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${s.toFixed(3)})`);
    img.dataset.fit = s > 1.02 ? 'zoom' : 'fit';
    // a zoomed photo needs a sharper source from the srcset
    if (s > 1.15 && img.hasAttribute('srcset')) {
      const box = img.getBoundingClientRect().width;
      if (box > 0) img.sizes = `${Math.ceil(box * Math.min(s, MAX))}px`;
    }
  };

  const queue = new Set();
  const process = async (img) => {
    if (img.dataset.fit || queue.has(img)) return;
    const src = srcOf(img);
    if (!src) return;
    const key = keyOf(src);
    if (key in cache) return apply(img, cache[key]);
    queue.add(img);
    const bb = await analyse(src);
    queue.delete(img);
    cache[key] = bb;
    save();
    apply(img, bb);
  };

  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              if (!e.isIntersecting) return;
              io.unobserve(e.target);
              process(e.target);
            }),
          { rootMargin: '400px 0px' }
        )
      : null;

  const watch = (root) => {
    const list = root.matches && root.matches(SEL) ? [root] : root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    list.forEach((img) => {
      if (img.dataset.fit || img.dataset.fitWatch) return;
      img.dataset.fitWatch = '1';
      // cached → apply at once (no visible jump on repeat views)
      const src = srcOf(img);
      const key = src && keyOf(src);
      if (key && key in cache) return apply(img, cache[key]);
      // horizontal rails: cards behind the edge never "intersect" — do them all now
      if (!io || img.closest('.velto-pmore__list, .velto-spot__rail, [data-velto-rail], .slider')) process(img);
      else io.observe(img);
    });
  };

  const start = () => {
    watch(document);
    new MutationObserver((muts) =>
      muts.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && watch(n)))
    ).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.veltoFit = { watch };
})();
