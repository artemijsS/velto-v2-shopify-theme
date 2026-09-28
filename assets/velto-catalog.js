/* Velto — desktop catalog panel (header sub-navigation).
   Opens on click (and on hover with intent delay), categories on the left
   switch the subcategory pane on hover/focus; closes on Esc, outside click
   or leaving the panel. */
if (!customElements.get('velto-catalog')) {
  customElements.define(
    'velto-catalog',
    class VeltoCatalog extends HTMLElement {
      connectedCallback() {
        this.toggle = this.querySelector('.velto-catalog__toggle');
        this.panel = this.querySelector('.velto-catalog__panel');
        this.cats = [...this.querySelectorAll('.velto-catalog__cat')];
        this.panes = [...this.querySelectorAll('.velto-catalog__pane')];
        this.backdrop = document.querySelector('.velto-catalog__backdrop');

        this.toggle.addEventListener('click', () => {
          clearTimeout(this.openTimer);
          // a click right after hover-intent opened it must not close it again
          if (this.isOpen && Date.now() - this.openedAt < 600) return;
          this.isOpen ? this.close() : this.open();
        });

        // hover intent on the button
        this.toggle.addEventListener('mouseenter', () => {
          clearTimeout(this.closeTimer);
          this.openTimer = setTimeout(() => this.open(), 180);
        });
        this.toggle.addEventListener('mouseleave', () => clearTimeout(this.openTimer));

        this.addEventListener('mouseleave', () => {
          this.closeTimer = setTimeout(() => this.close(), 250);
        });
        this.addEventListener('mouseenter', () => clearTimeout(this.closeTimer));

        this.cats.forEach((a) => {
          const activate = () => this.activate(+a.dataset.index);
          a.addEventListener('mouseenter', () => {
            clearTimeout(this.catTimer);
            this.catTimer = setTimeout(activate, 60);
          });
          a.addEventListener('focus', activate);
        });

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && this.isOpen) {
            this.close();
            this.toggle.focus();
          }
        });
        this.backdrop?.addEventListener('click', () => this.close());
      }

      get isOpen() {
        return this.toggle.getAttribute('aria-expanded') === 'true';
      }

      activate(i) {
        this.cats.forEach((c, k) => c.classList.toggle('is-active', k === i));
        this.panes.forEach((p, k) => p.classList.toggle('is-active', k === i));
      }

      open() {
        if (this.isOpen) return;
        const current = this.cats.findIndex((c) => c.classList.contains('is-current'));
        this.activate(current > -1 ? current : 0);
        this.panel.hidden = false;
        // fit the panel between the header and the bottom of the window
        const top = this.closest('.velto-subnav')?.getBoundingClientRect().bottom || 0;
        this.panel.style.setProperty('--velto-catalog-top', `${Math.max(0, Math.round(top))}px`);
        if (this.backdrop) this.backdrop.hidden = false;
        // force a reflow so the fade-in transition runs, then show —
        // no requestAnimationFrame (it can be deferred in background tabs,
        // leaving an "open" but invisible panel)
        void this.panel.offsetHeight;
        this.classList.add('is-open');
        document.body.classList.add('velto-catalog-open');
        this.toggle.setAttribute('aria-expanded', 'true');
        this.openedAt = Date.now();
      }

      close() {
        if (!this.isOpen) return;
        clearTimeout(this.openTimer);
        this.classList.remove('is-open');
        document.body.classList.remove('velto-catalog-open');
        this.toggle.setAttribute('aria-expanded', 'false');
        setTimeout(() => {
          if (!this.isOpen) {
            this.panel.hidden = true;
            if (this.backdrop) this.backdrop.hidden = true;
          }
        }, 200);
      }
    }
  );
}

/* Search pill in the header row → opens Dawn's search modal */
document.addEventListener('click', (e) => {
  const pill = e.target.closest('[data-velto-search]');
  if (!pill) return;
  e.preventDefault();
  const summary = document.querySelector('.header__icons details-modal.header__search summary');
  if (summary) summary.click();
});

/* Highlight the header quick link that matches the current page.
   Match = same path + every query param of the link present with the same
   (decoded) value — so extra params (sort, page, other filters) still match.
   If no quick link matches but we're on a collection page, the "Katalogs"
   button gets the active state instead. Re-checked after facet filtering
   (history.pushState) and back/forward. */
(() => {
  const norm = (p) => decodeURIComponent(p).replace(/\/+$/, '').toLowerCase() || '/';

  const matches = (href) => {
    const u = new URL(href, location.origin);
    if (norm(u.pathname) !== norm(location.pathname)) return false;
    const here = new URLSearchParams(location.search);
    for (const [k, v] of u.searchParams) {
      if (!here.getAll(k).includes(v)) return false;
    }
    return true;
  };

  const update = () => {
    const links = [...document.querySelectorAll('.velto-subnav__quick a')];
    let any = false;
    // prefer the most specific match (most query params)
    const scored = links
      .map((a) => ({ a, ok: matches(a.href), n: new URL(a.href, location.origin).searchParams.size || 0 }))
      .filter((x) => x.ok)
      .sort((x, y) => y.n - x.n);
    links.forEach((a) => {
      const on = scored.length && scored[0].a === a;
      a.classList.toggle('is-active', !!on);
      if (on) { a.setAttribute('aria-current', 'page'); any = true; } else a.removeAttribute('aria-current');
    });
    const toggle = document.querySelector('.velto-catalog__toggle');
    if (toggle) toggle.classList.toggle('is-current', !any && /^\/(\w{2}(-\w{2})?\/)?collections\//.test(location.pathname));
  };

  update();
  window.addEventListener('popstate', update);
  const push = history.pushState;
  history.pushState = function (...args) {
    const r = push.apply(this, args);
    update();
    return r;
  };
})();
