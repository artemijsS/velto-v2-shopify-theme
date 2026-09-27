/* Velto — rotating best-sellers showcase in the homepage hero.
   Loads up to 30 best sellers (sections/velto-top-products rendered in the
   context of /collections/<handle>?sort_by=best-selling) and shows them
   4 at a time, swapping the group every few seconds with a staggered
   crossfade. Pauses on hover/focus, when the tab is hidden or the hero is
   off-screen. */
if (!customElements.get('velto-showcase')) {
  customElements.define(
    'velto-showcase',
    class VeltoShowcase extends HTMLElement {
      connectedCallback() {
        this.list = this.querySelector('.velto-hero__showcase');
        this.tiles = Array.from(this.list.querySelectorAll('.velto-hero__tile'));
        this.dotsEl = this.querySelector('.velto-hero__dots');
        this.perPage = this.tiles.length || 4;
        this.interval = Math.max(3000, parseInt(this.dataset.interval, 10) || 5000);
        this.limit = Math.min(30, Math.max(this.perPage, parseInt(this.dataset.limit, 10) || 30));
        this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.page = 0;
        this.paused = false;
        this.visible = true;

        // Never leave the tiles hidden if the request is slow or fails.
        this.revealTimer = setTimeout(() => this.reveal(), 2500);
        this.load();
      }

      disconnectedCallback() {
        clearTimeout(this.timer);
        clearTimeout(this.revealTimer);
        this.observer?.disconnect();
        document.removeEventListener('visibilitychange', this.onVisibility);
      }

      async load() {
        try {
          const res = await fetch(this.dataset.src, { credentials: 'same-origin' });
          if (!res.ok) throw new Error(res.status);
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const json = doc.querySelector('[data-velto-top]');
          const items = JSON.parse(json.textContent).slice(0, this.limit);
          if (items.length < this.perPage) throw new Error('not enough products');
          this.items = items;
          this.pages = Math.ceil(items.length / this.perPage);
          await this.render(0, false);
          this.reveal();
          if (this.pages > 1) this.start();
        } catch (e) {
          this.reveal();
        }
      }

      reveal() {
        clearTimeout(this.revealTimer);
        this.list.classList.remove('is-loading');
      }

      itemsForPage(page) {
        const out = [];
        for (let i = 0; i < this.perPage; i++) {
          out.push(this.items[(page * this.perPage + i) % this.items.length]);
        }
        return out;
      }

      preload(items) {
        return Promise.all(
          items.map(
            (item) =>
              new Promise((resolve) => {
                const img = new Image();
                img.onload = img.onerror = resolve;
                img.src = item.img;
              })
          )
        );
      }

      fill(tile, item) {
        const a = tile.querySelector('a');
        let img = a.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          a.prepend(img);
        }
        a.href = item.url;
        a.setAttribute('aria-label', `${item.title} — ${item.price.replace(/<[^>]*>/g, '')}`);
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = item.img;
        img.alt = '';
        img.width = 500;
        img.height = 500;
        a.querySelector('.velto-hero__tile-price').innerHTML = item.price;
      }

      async render(page, animate = true) {
        const items = this.itemsForPage(page);
        await this.preload(items);

        if (!animate || this.reduceMotion) {
          this.tiles.forEach((tile, i) => this.fill(tile, items[i]));
        } else {
          await Promise.all(
            this.tiles.map(
              (tile, i) =>
                new Promise((resolve) => {
                  setTimeout(() => {
                    tile.classList.add('is-swapping');
                    setTimeout(() => {
                      this.fill(tile, items[i]);
                      tile.classList.remove('is-swapping');
                      resolve();
                    }, 280);
                  }, i * 110);
                })
            )
          );
        }

        this.page = page;
        this.updateDots();
      }

      /* ---------- dots ---------- */
      buildDots() {
        if (!this.dotsEl || this.pages < 2) return;
        this.dotsEl.innerHTML = '';
        for (let i = 0; i < this.pages; i++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'velto-hero__dot';
          b.setAttribute('aria-label', `${i + 1} / ${this.pages}`);
          b.addEventListener('click', () => this.goTo(i));
          this.dotsEl.appendChild(b);
        }
        this.dotsEl.hidden = false;
      }

      updateDots() {
        if (!this.dotsEl) return;
        if (!this.dotsEl.children.length) this.buildDots();
        Array.from(this.dotsEl.children).forEach((d, i) => {
          d.classList.toggle('is-active', i === this.page);
          d.setAttribute('aria-current', i === this.page ? 'true' : 'false');
        });
        this.style.setProperty('--velto-rotate', `${this.interval}ms`);
      }

      /* ---------- rotation ---------- */
      start() {
        const pause = () => { this.paused = true; this.schedule(); };
        const resume = () => { this.paused = false; this.schedule(); };
        this.addEventListener('mouseenter', pause);
        this.addEventListener('mouseleave', resume);
        this.addEventListener('focusin', pause);
        this.addEventListener('focusout', resume);

        this.onVisibility = () => this.schedule();
        document.addEventListener('visibilitychange', this.onVisibility);

        this.observer = new IntersectionObserver((entries) => {
          this.visible = entries[0].isIntersecting;
          this.schedule();
        });
        this.observer.observe(this);

        this.schedule();
      }

      canRun() {
        return !this.paused && this.visible && !document.hidden;
      }

      schedule() {
        clearTimeout(this.timer);
        this.classList.toggle('is-paused', !this.canRun());
        if (!this.canRun()) return;
        this.timer = setTimeout(() => this.next(), this.interval);
      }

      async next() {
        if (this.busy) return;
        this.busy = true;
        await this.render((this.page + 1) % this.pages);
        this.busy = false;
        this.schedule();
      }

      async goTo(page) {
        if (this.busy || page === this.page) return;
        clearTimeout(this.timer);
        this.busy = true;
        await this.render(page);
        this.busy = false;
        this.schedule();
      }
    }
  );
}
