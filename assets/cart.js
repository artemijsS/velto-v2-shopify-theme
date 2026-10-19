class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0, event);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends window.StandardEvents.createViewEventElement(HTMLElement) {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    // Velto: on the cart page every change is applied on screen at once and sent
    // to Shopify in one batched request (see queueUpdate) — no waiting, no spinners
    this.addEventListener('change', (event) => {
      if (this.isQueued(event.target)) this.onChange(event);
      else debouncedOnChange(event);
    });

    this.pendingUpdates = {};
    this.flushTimer = null;
    this.inFlight = false;
  }

  cartUpdateUnsubscriber = undefined;

  static pendingCartDataPromise = null;

  connectedCallback() {
    // The factory base class auto-dispatches cart:view from the
    // `view-event-payload` attribute (Liquid filter output). The drawer
    // sets `view-event-trigger="manual"` to skip auto-dispatch.
    super.connectedCallback();

    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') return;
      if (this.isSyncing()) return;
      return this.onCartUpdate();
    });

    // Upcharge Fees app finished adding/removing its lines (deposit, bag fee…) —
    // show them without reloading the page (the reload is switched off in velto-fees.js)
    this.onFeesUpdated = () => {
      if (this.tagName !== 'CART-ITEMS' || !document.getElementById('main-cart-footer')) return;
      if (this.isSyncing()) {
        this.feesDirty = true;
        return;
      }
      this.refreshSections();
    };
    document.addEventListener('mwFees::cart::exec::successfully', this.onFeesUpdated);
  }

  // Fetches the full cart shape (used to resolve the cart:lines-update event
  // promise after /cart/add.js, which only returns the added line — not the
  // post-mutation cart aggregates). De-duplicated across concurrent callers.
  static fetchCartData() {
    if (!CartItems.pendingCartDataPromise) {
      const pendingCartDataPromise = fetch(`${routes.cart_url}.json`)
        .then((response) => response.json())
        .catch(() => null)
        .finally(() => {
          if (CartItems.pendingCartDataPromise === pendingCartDataPromise) CartItems.pendingCartDataPromise = null;
        });

      CartItems.pendingCartDataPromise = pendingCartDataPromise;
    }
    return CartItems.pendingCartDataPromise;
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
    if (this.onFeesUpdated) document.removeEventListener('mwFees::cart::exec::successfully', this.onFeesUpdated);
  }

  /* ---------- Velto: optimistic, batched quantity updates (cart page) ---------- */

  // the cart page rows carry their line key; the (unused) drawer keeps Dawn's flow
  isQueued(target) {
    return this.tagName === 'CART-ITEMS' && !!target?.closest?.('tr[data-line-key]');
  }

  isSyncing() {
    return this.inFlight || !!this.flushTimer || Object.keys(this.pendingUpdates).length > 0;
  }

  queueUpdate(line, quantity, name) {
    const row = document.getElementById(`CartItem-${line}`);
    const key = row && row.dataset.lineKey;
    if (!key) return false;

    this.pendingUpdates[key] = { quantity, name };
    this.paintLine(row, quantity);
    this.setSyncing(true);

    clearTimeout(this.flushTimer);
    // removals go out right away, +/- clicks are collected for a moment
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, quantity === 0 ? 0 : CART_BATCH_DELAY);
    return true;
  }

  // instant feedback: line total (and the row itself on removal)
  paintLine(row, quantity) {
    const errorText = row.querySelector('.cart-item__error-text');
    if (errorText) errorText.textContent = '';

    if (quantity === 0) {
      row.classList.add('velto-cart-item--removing');
      return;
    }
    row.classList.remove('velto-cart-item--removing');

    const money = window.veltoCart && window.veltoCart.money;
    const finalPrice = parseInt(row.dataset.priceFinal);
    const originalPrice = parseInt(row.dataset.priceOriginal);
    if (!money || isNaN(finalPrice)) return;

    row.querySelectorAll('.cart-item__price-wrapper').forEach((wrap) => {
      const old = wrap.querySelector('.cart-item__old-price');
      if (old && !isNaN(originalPrice)) old.textContent = money(originalPrice * quantity);
      const current = wrap.querySelector('dd.price') || wrap.querySelector('span.price');
      if (current) current.textContent = money(finalPrice * quantity);
    });
  }

  setSyncing(on) {
    // dims the totals and holds the checkout buttons until Shopify has the new quantities
    document.documentElement.classList.toggle('velto-cart-syncing', on);
  }

  async flush() {
    if (this.inFlight) return; // the running request picks the rest up when it finishes
    const batch = this.pendingUpdates;
    const keys = Object.keys(batch);
    if (!keys.length) return this.setSyncing(false);
    this.pendingUpdates = {};
    this.inFlight = true;

    const updates = {};
    keys.forEach((key) => (updates[key] = batch[key].quantity));
    const lines = keys.map((key) => ({ id: key, quantity: batch[key].quantity }));
    const linesUpdateDeferred = this.createBatchLinesUpdateEvent(lines);
    const sectionsToRender = this.getSectionsToRender();

    let state = null;
    let failed = false;
    try {
      const response = await fetch(`${routes.cart_update_url}`, {
        ...fetchConfig(),
        body: JSON.stringify({
          updates,
          sections: sectionsToRender.map((section) => section.section),
          sections_url: window.location.pathname,
        }),
      });
      state = await response.json();
      if (!response.ok || state.status || state.errors || !state.items) {
        throw new Error(state.description || state.message || state.errors || window.cartStrings.error);
      }
      this.resolveCartLinesUpdate(linesUpdateDeferred, state);
    } catch (e) {
      failed = true;
      linesUpdateDeferred?.reject(e);
      this.dispatchCartErrorEvent(e.message || window.cartStrings.error, 'SERVICE_UNAVAILABLE');
    }

    this.inFlight = false;

    // newer edits are waiting: send them first, paint once at the end
    if (Object.keys(this.pendingUpdates).length || this.flushTimer) {
      if (!this.flushTimer) this.flush();
      return;
    }

    if (failed) {
      await this.refreshSections();
      const errors = document.getElementById('cart-errors');
      if (errors) errors.textContent = window.cartStrings.error;
      this.setSyncing(false);
      return;
    }

    this.renderState(state, sectionsToRender);

    // Shopify gave less than asked (stock / quantity rules) → say so on that line
    keys.forEach((key) => {
      const wanted = batch[key].quantity;
      if (!wanted) return;
      const item = state.items.find((i) => i.key === key);
      const got = item ? item.quantity : 0;
      if (got >= wanted) return;
      const row = this.querySelector(`tr[data-line-key="${CSS.escape(key)}"]`);
      const text = row?.querySelector('.cart-item__error-text');
      if (text) text.textContent = item ? window.cartStrings.quantityError.replace('[quantity]', got) : window.cartStrings.error;
    });

    publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: state });

    if (this.feesDirty) {
      this.feesDirty = false;
      this.refreshSections();
    } else {
      this.setSyncing(false);
    }
  }

  renderState(state, sectionsToRender) {
    if (!state.sections) return;
    const active = document.activeElement;
    const focusKey = active?.closest?.('tr[data-line-key]')?.dataset.lineKey;
    const focusName = active?.getAttribute?.('name');

    this.classList.toggle('is-empty', state.item_count === 0);
    const cartFooter = document.getElementById('main-cart-footer');
    if (cartFooter) cartFooter.classList.toggle('is-empty', state.item_count === 0);

    sectionsToRender.forEach((section) => {
      const html = state.sections[section.section];
      const host = document.getElementById(section.id);
      if (!html || !host) return;
      const target = host.querySelector(section.selector) || host;
      target.innerHTML = this.getSectionInnerHTML(html, section.selector);
    });

    // keep the keyboard where it was (the row was re-rendered)
    if (focusKey && focusName) {
      const row = this.querySelector(`tr[data-line-key="${CSS.escape(focusKey)}"]`);
      row?.querySelector(`[name="${focusName}"]`)?.focus({ preventScroll: true });
    }
  }

  // re-read the cart from Shopify (after the fees app or an error)
  async refreshSections() {
    const sectionsToRender = this.getSectionsToRender();
    const ids = [...new Set(sectionsToRender.map((s) => s.section))].join(',');
    try {
      const [sections, cart] = await Promise.all([
        fetch(`${routes.cart_url}?sections=${ids}`).then((r) => r.json()),
        fetch(`${routes.cart_url}.js`).then((r) => r.json()),
      ]);
      if (this.isSyncing()) return; // user is editing again — the next response repaints
      this.renderState({ ...cart, sections }, sectionsToRender);
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: cart });
    } catch (e) {
      console.error(e);
    } finally {
      if (!this.isSyncing()) this.setSyncing(false);
    }
  }

  createBatchLinesUpdateEvent(lines) {
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent) return null;
    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: lines.every((l) => l.quantity === 0) ? 'remove' : 'update',
        context: 'cart',
        lines,
        promise: deferred.promise,
      })
    );
    return deferred;
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = '';

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        event,
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, event, name, variantId) {
    if (this.tagName === 'CART-ITEMS' && this.queueUpdate(line, quantity, name)) return;

    const eventTarget = event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';
    const cartPerformanceUpdateMarker = CartPerformance.createStartingMarker(`${eventTarget}:user-action`);

    this.enableLoading(line);

    const action = quantity === 0 ? 'remove' : 'update';
    const quantityInput = this.querySelector(`#Quantity-${line}`) || this.querySelector(`#Drawer-quantity-${line}`);
    const lineVariantId = variantId || quantityInput?.dataset.quantityVariantId;
    const lineKey = quantityInput?.dataset.quantityLineKey;
    const linesUpdateDeferred = this.createCartLinesUpdateEvent(action, lineVariantId, quantity, lineKey);

    // Cache sections before the fetch so we read dataset.id while elements still exist in the DOM
    const sectionsToRender = this.getSectionsToRender();

    const body = JSON.stringify({
      line,
      quantity,
      sections: sectionsToRender.map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);

        if (parsedState.errors) {
          this.dispatchCartErrorEvent(parsedState.errors, 'INVALID');
          linesUpdateDeferred?.reject(new Error(parsedState.errors));
        } else {
          this.resolveCartLinesUpdate(linesUpdateDeferred, parsedState);
        }

        CartPerformance.measure(`${eventTarget}:paint-updated-sections`, () => {
          const quantityElement =
            document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
          const items = document.querySelectorAll('.cart-item');

          if (parsedState.errors) {
            quantityElement.value = quantityElement.getAttribute('value');
            this.updateLiveRegions(line, parsedState.errors);
            return;
          }

          this.classList.toggle('is-empty', parsedState.item_count === 0);
          const cartDrawerWrapper = document.querySelector('cart-drawer');
          const cartFooter = document.getElementById('main-cart-footer');

          if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
          if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

          sectionsToRender.forEach((section) => {
            const elementToReplace =
              document.getElementById(section.id).querySelector(section.selector) ||
              document.getElementById(section.id);
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              section.selector
            );
          });
          const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
          let message = '';
          if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
            if (typeof updatedValue === 'undefined') {
              message = window.cartStrings.error;
            } else {
              message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
            }
          }
          this.updateLiveRegions(line, message);

          const lineItem =
            document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
          if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
            cartDrawerWrapper
              ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
              : lineItem.querySelector(`[name="${name}"]`).focus();
          } else if (parsedState.item_count === 0 && cartDrawerWrapper?.querySelector('.drawer__inner-empty')) {
            trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
          } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
          }
        });

        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
      })
      .catch((e) => {
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errors) errors.textContent = window.cartStrings.error;
        this.dispatchCartErrorEvent(window.cartStrings.error, 'SERVICE_UNAVAILABLE');
        linesUpdateDeferred?.reject(e);
      })
      .finally(() => {
        this.disableLoading(line);
        CartPerformance.measureFromMarker(`${eventTarget}:user-action`, cartPerformanceUpdateMarker);
      });
  }

  createCartLinesUpdateEvent(action, variantId, quantity, lineKey) {
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent || !variantId) return null;
    // No AJAX line key on the row — likely cached HTML rendered before this
    // attribute landed. Skip dispatch rather than emit an event with id: ''.
    if (!lineKey) return null;

    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action,
        context: 'cart',
        lines: [{ id: lineKey, quantity }],
        promise: deferred.promise,
      })
    );
    return deferred;
  }

  resolveCartLinesUpdate(deferred, parsedState) {
    if (!deferred) return;
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent) return;

    deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(parsedState) });
  }

  dispatchCartErrorEvent(message, code) {
    const { CartErrorEvent } = window.StandardEvents || {};
    if (!CartErrorEvent) return;
    this.dispatchEvent(new CartErrorEvent({ error: message, code }));
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const newNote = event.target.value;
            const noteDeferred = this.dispatchNoteUpdateEvent(newNote);

            const body = JSON.stringify({ note: newNote });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } })
              .then((r) => r.json())
              .then((cart) => {
                if (!cart || cart.errors) {
                  throw Object.assign(new Error(cart?.errors), { code: 'INVALID' });
                }

                if (noteDeferred) {
                  const { CartNoteUpdateEvent } = window.StandardEvents || {};
                  if (CartNoteUpdateEvent) {
                    noteDeferred.resolve({ cart: CartNoteUpdateEvent.createCartFromAjaxResponse(cart) });
                  }
                }
                CartPerformance.measureFromEvent('note-update:user-action', event);
              })
              .catch((e) => {
                noteDeferred?.reject(e);
                const { CartErrorEvent } = window.StandardEvents || {};
                if (CartErrorEvent) {
                  this.dispatchEvent(
                    new CartErrorEvent({
                      error: e.message || 'Note update failed',
                      code: e.code || 'SERVICE_UNAVAILABLE',
                    })
                  );
                }
              });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }

      dispatchNoteUpdateEvent(newNote) {
        const { CartNoteUpdateEvent } = window.StandardEvents || {};
        if (!CartNoteUpdateEvent) return null;

        const context = this.closest('dialog') || this.closest('cart-drawer') ? 'dialog' : 'cart';
        const deferred = CartNoteUpdateEvent.createPromise();

        this.dispatchEvent(
          new CartNoteUpdateEvent({
            context,
            note: newNote,
            promise: deferred.promise,
          })
        );

        return deferred;
      }
    }
  );
}
