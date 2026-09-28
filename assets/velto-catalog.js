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
        if (this.backdrop) this.backdrop.hidden = false;
        requestAnimationFrame(() => {
          this.classList.add('is-open');
          document.body.classList.add('velto-catalog-open');
        });
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
