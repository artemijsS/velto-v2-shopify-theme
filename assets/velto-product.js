/* Velto — product page enhancements.
   1) Structures the imported (supplier-feed) description into:
      key facts grid · "Apraksts" · sections (Sastāvs, Uzturvērtība, …) as
      accordions; allergens in ingredient lists are highlighted.
      Pure progressive enhancement: if the description has no recognizable
      structure it is left as is.
   2) Sticky "add to cart" bar once the main button scrolls out of view. */
(() => {
  const S = window.veltoProductStrings || {};
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const stripColon = (t) => clean(t).replace(/[:：]\s*$/, '');
  const isBlank = (n) => n.nodeType === 3 ? !n.textContent.trim() : n.nodeName === 'BR';

  /* ---------------- description ---------------- */
  function structure(desc) {
    if (!desc || desc.dataset.veltoDone) return;
    desc.dataset.veltoDone = '1';

    const facts = [];
    const sections = [];
    let cur = { title: null, nodes: [] };
    const hasContent = (sec) =>
      sec.nodes.some((n) => (n.textContent || '').trim() || (n.querySelector && n.querySelector('img,table')));
    const start = (title) => {
      if (hasContent(cur) || cur.title) sections.push(cur);
      cur = { title: stripColon(title), nodes: [] };
    };
    const addFact = (k, v) => {
      k = stripColon(k);
      v = clean(v);
      if (k && v && k.length <= 40 && !facts.some((f) => f[0] === k)) facts.push([k, v]);
    };
    const para = (nodes) => {
      const p = document.createElement('p');
      nodes.forEach((n) => p.appendChild(n));
      if (p.textContent.trim() || p.querySelector('img')) cur.nodes.push(p);
    };

    // split a <p> into lines by <br>; a line starting with <strong>/<b> is a heading
    // (alone on the line / long text after it) or a short "Label: value" fact
    const handleP = (p) => {
      const lines = [[]];
      [...p.childNodes].forEach((n) => (n.nodeName === 'BR' ? lines.push([]) : lines[lines.length - 1].push(n)));
      lines.forEach((line) => {
        const nodes = line.filter((n) => !isBlank(n));
        if (!nodes.length) return;
        const first = nodes[0];
        const isStrong = first.nodeType === 1 && /^(STRONG|B)$/.test(first.nodeName);
        if (isStrong) {
          const label = clean(first.textContent);
          const rest = clean(nodes.slice(1).map((n) => n.textContent).join(' ')).replace(/^[:：]\s*/, '');
          if (label && label.length <= 60 && label === label.replace(/[.!?]$/, '')) {
            if (!rest) return start(label);
            if (/[:：]$/.test(label) && rest.length <= 60) return addFact(label, rest);
            if (/[:：]$/.test(label)) {
              start(label);
              return para(nodes.slice(1));
            }
          }
        }
        para(nodes);
      });
    };

    const handleTable = (table) => {
      const rows = [...table.rows];
      const head = rows[0];
      if (head && head.cells.length === 1 && head.cells[0].colSpan > 1) {
        start(head.cells[0].textContent);
        head.remove();
      } else if (head && /uzturvērt|nutrition|пищев/i.test(head.cells[0]?.textContent || '')) {
        // nutrition table under a mislabelled / generic heading ("Sastāvs" in some feeds)
        const title = stripColon(head.cells[0].textContent);
        const small = clean(cur.nodes.map((n) => n.textContent).join(' ')).length < 40;
        if (!cur.title || !/uzturvērt|nutrition|пищев/i.test(cur.title)) {
          if (cur.title && small) { cur.title = title; cur.nodes = []; }
          else start(title);
        }
        head.classList.add('is-head');
      }
      table.removeAttribute('style');
      table.querySelectorAll('td.indent, th.indent').forEach((el) => el.classList.add('is-sub'));
      table.querySelectorAll('[style]').forEach((el) => {
        const indent = /padding-left:\s*1[0-9]px/.test(el.getAttribute('style'));
        el.removeAttribute('style');
        if (indent) el.classList.add('is-sub');
      });
      table.classList.add('velto-ntable');
      cur.nodes.push(table);
    };

    const walk = (nodes) => {
      nodes.forEach((n) => {
        if (n.nodeType === 3) {
          if (n.textContent.trim()) para([n]);
          return;
        }
        if (n.nodeType !== 1) return;
        const tag = n.nodeName;
        if (/^H[1-6]$/.test(tag) || (tag === 'P' && n.classList.contains('heading'))) return start(n.textContent);
        if (n.classList.contains('product__list-wrapper')) {
          if (n.classList.contains('-basic')) {
            n.querySelectorAll('li.item').forEach((li) => {
              const k = li.querySelector(':scope > span');
              const v = li.querySelector('.text');
              if (k && v) addFact(k.textContent, v.textContent);
            });
            return;
          }
          return walk([...n.childNodes]);
        }
        if (tag === 'UL' && n.classList.contains('list')) {
          n.querySelectorAll('li.item .text').forEach((t) => {
            if (t.textContent.trim()) cur.nodes.push(...[...t.children].filter((c) => c.textContent.trim()));
          });
          return;
        }
        if (tag === 'TABLE') return handleTable(n);
        if (tag === 'P') return handleP(n);
        if (tag === 'DIV' && n.children.length && ![...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
          return walk([...n.childNodes]);
        cur.nodes.push(n);
      });
    };

    const source = document.createElement('div');
    source.innerHTML = desc.innerHTML;
    walk([...source.childNodes]);
    if (hasContent(cur)) sections.push(cur);

    const titled = sections.filter((s) => s.title);
    if (titled.length < 2 && facts.length < 2) {
      // nothing to structure — restore original
      return;
    }

    const out = document.createElement('div');
    out.className = 'velto-pinfo';

    if (facts.length) {
      const dl = document.createElement('dl');
      dl.className = 'velto-pinfo__facts';
      facts.forEach(([k, v]) => {
        const row = document.createElement('div');
        row.innerHTML = '<dt></dt><dd></dd>';
        row.children[0].textContent = k;
        row.children[1].textContent = v;
        dl.appendChild(row);
      });
      out.appendChild(dl);
    }

    const OPEN = /^(apraksts|produkta apraksts|preces apraksts|sastāvs|sastāvdaļas|uzturvērtība|описание|состав|description|ingredients)/i;
    sections.forEach((sec, i) => {
      if (!hasContent(sec)) return;
      const title = sec.title || S.about || 'Apraksts';
      const d = document.createElement('details');
      d.className = 'velto-pinfo__sec';
      if (/uzturvērt|пищев|nutrition/i.test(title)) d.classList.add('is-nutrition');
      if (!sec.title || OPEN.test(title) || sections.length <= 2) d.open = true;
      const sum = document.createElement('summary');
      sum.innerHTML = '<span></span><span class="velto-pinfo__chev" aria-hidden="true"></span>';
      sum.firstChild.textContent = title;
      const body = document.createElement('div');
      body.className = 'velto-pinfo__body';
      sec.nodes.forEach((n) => body.appendChild(n));
      if (/sastāv|alerg|состав|ingredient/i.test(title)) highlightAllergens(body);
      d.append(sum, body);
      out.appendChild(d);
    });

    desc.innerHTML = '';
    desc.appendChild(out);
    desc.classList.add('is-structured');
  }

  // uppercase words (EU allergen convention) → <strong class="velto-allergen">
  function highlightAllergens(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    const re = /\b([A-ZĀČĒĢĪĶĻŅŠŪŽ]{3,}(?:[ -][A-ZĀČĒĢĪĶĻŅŠŪŽ]{2,})*)\b/gu;
    texts.forEach((t) => {
      if (t.parentElement.closest('strong,b,.velto-allergen')) return;
      const s = t.textContent;
      if (!re.test(s)) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      s.replace(re, (m, _g, idx) => {
        frag.append(s.slice(last, idx));
        const b = document.createElement('strong');
        b.className = 'velto-allergen';
        b.textContent = m;
        frag.append(b);
        last = idx + m.length;
      });
      frag.append(s.slice(last));
      t.replaceWith(frag);
    });
  }

  /* ---------------- sticky add to cart ---------------- */
  function stickyBar() {
    const info = document.querySelector('.product__info-container');
    const btn = info && info.querySelector('product-form .product-form__submit');
    if (!btn || document.querySelector('.velto-satc')) return;
    const title = clean(info.querySelector('.product__title h1')?.textContent);
    const img = document.querySelector('.product__media-item img, .product-media-container img');

    const bar = document.createElement('div');
    bar.className = 'velto-satc';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML =
      '<div class="page-width velto-satc__inner">' +
      '<span class="velto-satc__img"></span>' +
      '<span class="velto-satc__text"><span class="velto-satc__title"></span><span class="velto-satc__price"></span></span>' +
      '<button type="button" class="velto-satc__btn" tabindex="-1"></button>' +
      '</div>';
    if (img) {
      const i = new Image();
      i.src = img.currentSrc || img.src;
      i.alt = '';
      bar.querySelector('.velto-satc__img').appendChild(i);
    }
    bar.querySelector('.velto-satc__title').textContent = title;
    const priceEl = bar.querySelector('.velto-satc__price');
    const b = bar.querySelector('.velto-satc__btn');

    const sync = () => {
      const price = info.querySelector('.price .price-item--sale, .price .price-item--regular');
      priceEl.textContent = clean(price?.textContent);
      b.textContent = clean(btn.querySelector('span')?.textContent) || S.add || '';
      b.disabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    };
    b.addEventListener('click', () => {
      sync();
      if (!b.disabled) btn.click();
    });
    document.body.appendChild(bar);

    let shown = false;
    let ticking = false;
    const check = () => {
      ticking = false;
      const r = btn.getBoundingClientRect();
      const show = r.bottom < 0 && r.height > 0;
      if (show === shown) return;
      shown = show;
      if (show) sync();
      bar.classList.toggle('is-visible', show);
      document.body.classList.toggle('velto-has-satc', show);
      bar.setAttribute('aria-hidden', String(!show));
      b.tabIndex = show ? 0 : -1;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        setTimeout(check, 50);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
  }

  const init = () => {
    document.querySelectorAll('.product__description.rte').forEach(structure);
    stickyBar();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
