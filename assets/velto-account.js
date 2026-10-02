/* Velto — header account popup (snippets/velto-account.liquid). */
(() => {
  if (customElements.get('velto-account')) return;

  class VeltoAccount extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.btn = this.querySelector('.velto-acc__btn');
      this.panel = this.querySelector('.velto-acc__panel');
      this.onDoc = (e) => !this.contains(e.target) && this.close();
      this.onKey = (e) => e.key === 'Escape' && this.close(true);
      this.onResize = () => this.place();
      this.btn.addEventListener('click', () => (this.panel.hidden ? this.open() : this.close()));
      this.querySelector('[data-acc-close]').addEventListener('click', () => this.close(true));
    }

    /* phones: a full-width sheet right under the header */
    place() {
      const r = this.btn.getBoundingClientRect();
      this.panel.style.setProperty('--acc-top', `${Math.round(r.bottom + 8)}px`);
    }

    open() {
      this.place();
      this.panel.hidden = false;
      this.btn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => this.panel.classList.add('is-open'));
      document.addEventListener('click', this.onDoc, true);
      document.addEventListener('keydown', this.onKey);
      window.addEventListener('resize', this.onResize);
      window.addEventListener('scroll', this.onResize, { passive: true });
      const first = this.panel.querySelector('a, button:not([data-acc-close])');
      if (first) first.focus({ preventScroll: true });
    }

    close(returnFocus) {
      if (this.panel.hidden) return;
      this.panel.classList.remove('is-open');
      this.panel.hidden = true;
      this.btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', this.onDoc, true);
      document.removeEventListener('keydown', this.onKey);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('scroll', this.onResize);
      if (returnFocus) this.btn.focus({ preventScroll: true });
    }
  }

  customElements.define('velto-account', VeltoAccount);
})();
