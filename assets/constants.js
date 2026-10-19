const ON_CHANGE_DEBOUNCE_TIMER = 300;
const CART_BATCH_DELAY = 450; // Velto: cart page collects +/- clicks this long, then sends one request

const PUB_SUB_EVENTS = {
  cartUpdate: 'cart-update',
  quantityUpdate: 'quantity-update',
  optionValueSelectionChange: 'option-value-selection-change',
  variantChange: 'variant-change',
  cartError: 'cart-error',
};
