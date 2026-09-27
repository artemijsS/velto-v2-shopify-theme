/* Velto — "Rādīt vēl" for collection / search grids.
   Fetches the next page through the Section Rendering API and appends its
   cards to #product-grid, updating the progress bar. Classic pagination
   stays in the markup as the no-JS fallback (hidden once this is defined).
   Also auto-loads when the button scrolls into view, after the first
   manual click (so the footer stays reachable until the shopper opts in). */
if (!customElements.get('velto-load-more')) {
  customElements.define(
    'velto-load-more',
    class VeltoLoadMore extends HTMLElement {
      connectedCallback() {
        this.button = this.querySelector('button');
        this.label = this.querySelector('[data-shown]');
        this.bar = this.querySelector('.velto-more__bar span');
        this.total = parseInt(this.dataset.total, 10) || 0;
        this.shown = parseInt(this.dataset.shown, 10) || 0;
        this.template = this.dataset.template || '__SHOWN__ / __TOTAL__';
        this.button?.addEventListener('click', () => {
          this.auto = true;
          this.load();
        });
        this.io = new IntersectionObserver(
          (e) => { if (e[0].isIntersecting && this.auto) this.load(); },
          { rootMargin: '600px' }
        );
        this.io.observe(this);
        this.render();
      }

      disconnectedCallback() {
        this.io?.disconnect();
      }

      render() {
        if (this.label) {
          this.label.textContent = this.template
            .replace('__SHOWN__', this.shown)
            .replace('__TOTAL__', this.total);
        }
        if (this.bar && this.total) {
          this.bar.style.transform = `scaleX(${Math.min(1, this.shown / this.total)})`;
        }
      }

      async load() {
        const next = this.dataset.next;
        if (!next || this.loading) return;
        this.loading = true;
        this.classList.add('is-loading');
        this.button.setAttribute('aria-busy', 'true');

        try {
          const url = new URL(next, window.location.origin);
          url.searchParams.set('section_id', this.dataset.section);
          const html = await (await fetch(url)).text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const grid = document.getElementById('product-grid');
          const items = doc.querySelectorAll('#product-grid > li');

          items.forEach((li, i) => {
            li.style.setProperty('--animation-order', (i % 12) + 1);
            grid.appendChild(document.adoptNode(li));
          });

          this.shown += items.length;
          const nextEl = doc.querySelector('velto-load-more');
          const nextUrl = nextEl && nextEl.dataset.next;
          if (nextUrl) {
            this.dataset.next = nextUrl;
          } else {
            delete this.dataset.next;
            this.shown = this.total;
            this.classList.add('is-done');
            this.io.disconnect();
          }
          this.render();
        } catch (e) {
          // fall back to the regular next page
          window.location.href = next;
        } finally {
          this.loading = false;
          this.classList.remove('is-loading');
          this.button.removeAttribute('aria-busy');
        }
      }
    }
  );
}
