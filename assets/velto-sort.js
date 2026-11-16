/* Velto — the sort control of the filter row as a pill with its own list.
   The native <select name="sort_by"> stays in the form (facets.js reads it, and it is
   what works without JS); <velto-sort> sits next to it, hides it and shows a button +
   listbox in the style of the filter pills and their panels. Picking an option sets the
   select and fires its "input" event — exactly what choosing in the select would do.
   facets.js re-renders the ".sorting" block after every change: the new <velto-sort>
   builds itself again. Desktop only — the mobile drawer keeps the native select. */
if (!customElements.get('velto-sort')) {
  customElements.define(
    'velto-sort',
    class VeltoSort extends HTMLElement {
      connectedCallback() {
        if (this.built) return;
        const field = this.closest('.facet-filters__field');
        const select = field && field.querySelector('select');
        if (!select || !select.options.length) {
          // connected while the page is still being parsed: the select comes after us
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.connectedCallback(), { once: true });
          }
          return;
        }
        this.built = true;
        this.select = select;
        this.field = field;

        const label = field.querySelector('label');
        const listId = `VeltoSortList-${select.id || 'sort'}`;

        this.btn = document.createElement('button');
        this.btn.type = 'button';
        this.btn.className = 'velto-sort__btn';
        this.btn.setAttribute('aria-haspopup', 'listbox');
        this.btn.setAttribute('aria-expanded', 'false');
        this.btn.setAttribute('aria-controls', listId);
        this.value = document.createElement('span');
        this.value.className = 'velto-sort__value';
        this.btn.appendChild(this.value);
        const caret = field.querySelector('.icon-caret');
        if (caret) this.btn.appendChild(caret.cloneNode(true));

        this.list = document.createElement('ul');
        this.list.className = 'velto-sort__list';
        this.list.id = listId;
        this.list.setAttribute('role', 'listbox');
        if (label) this.list.setAttribute('aria-label', label.textContent.trim().replace(/:$/, ''));
        this.list.hidden = true;
        Array.from(select.options).forEach((o) => {
          const li = document.createElement('li');
          li.className = 'velto-sort__option';
          li.setAttribute('role', 'option');
          li.tabIndex = -1;
          li.dataset.value = o.value;
          li.textContent = o.textContent.trim();
          this.list.appendChild(li);
        });

        this.replaceChildren(this.btn, this.list);
        this.sync();

        this.btn.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
        this.btn.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            this.open();
          }
        });
        this.list.addEventListener('click', (e) => {
          const li = e.target.closest('.velto-sort__option');
          if (li) this.choose(li.dataset.value);
        });
        this.list.addEventListener('keydown', (e) => this.onListKey(e));
        this.addEventListener('focusout', (e) => {
          if (this.isOpen && e.relatedTarget && !this.contains(e.relatedTarget)) this.close(false);
        });
        this.onDocClick = (e) => {
          if (this.isOpen && !this.contains(e.target)) this.close(false);
        };
        // a change made elsewhere (mobile drawer, back/forward)
        select.addEventListener('change', () => this.sync());

        this.hidden = false;
        field.classList.add('velto-sort-on');
      }

      disconnectedCallback() {
        document.removeEventListener('click', this.onDocClick, true);
      }

      get isOpen() {
        return this.btn.getAttribute('aria-expanded') === 'true';
      }

      options() {
        return Array.from(this.list.children);
      }

      sync() {
        const current = this.select.value;
        this.options().forEach((li) => {
          const on = li.dataset.value === current;
          li.setAttribute('aria-selected', String(on));
          if (on) this.value.textContent = li.textContent;
        });
      }

      open() {
        if (this.isOpen) return;
        this.list.hidden = false;
        this.btn.setAttribute('aria-expanded', 'true');
        document.addEventListener('click', this.onDocClick, true);
        const sel = this.list.querySelector('[aria-selected="true"]') || this.list.firstElementChild;
        if (sel) sel.focus({ preventScroll: true });
      }

      close(refocus = true) {
        if (!this.isOpen) return;
        this.list.hidden = true;
        this.btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', this.onDocClick, true);
        if (refocus) this.btn.focus({ preventScroll: true });
      }

      onListKey(e) {
        const items = this.options();
        const i = items.indexOf(document.activeElement);
        const go = (n) => {
          e.preventDefault();
          items[Math.max(0, Math.min(items.length - 1, n))].focus({ preventScroll: true });
        };
        switch (e.key) {
          case 'ArrowDown': return go(i + 1);
          case 'ArrowUp': return go(i - 1);
          case 'Home': return go(0);
          case 'End': return go(items.length - 1);
          case 'Enter':
          case ' ':
            e.preventDefault();
            if (i > -1) this.choose(items[i].dataset.value);
            return undefined;
          case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            return this.close();
          case 'Tab':
            return this.close(false);
          default:
            return undefined;
        }
      }

      choose(value) {
        const changed = this.select.value !== value;
        this.close();
        if (!changed) return;
        this.select.value = value;
        this.sync();
        this.select.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  );
}
