/* Velto — "prices in other stores" dialog (snippets/velto-compare-dialog.liquid).
   Any element with data-velto-compare and data-barcode opens it; the click is caught on
   the document, so cards added later (load more, search, variant change) work too. */
(() => {
  const dialog = document.getElementById('VeltoCompare');
  if (!dialog) return;
  const frame = dialog.querySelector('[data-cmp-frame]');
  const product = dialog.querySelector('[data-cmp-product]');

  const urlFor = (barcode) => `${dialog.dataset.src}&barcode=${encodeURIComponent(barcode)}`;

  frame.addEventListener('load', () => dialog.classList.remove('is-loading'));

  dialog.addEventListener('close', () => {
    // stop the widget and forget the product, so the next one never flashes the old prices
    frame.removeAttribute('src');
    document.body.classList.remove('velto-cmpd-open');
  });

  dialog.addEventListener('click', (e) => {
    // a click on the dialog itself is a click on the backdrop around the panel
    if (e.target === dialog || e.target.closest('[data-cmp-close]')) dialog.close();
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-velto-compare]');
    if (!trigger || !trigger.dataset.barcode) return;
    e.preventDefault();
    if (typeof dialog.showModal !== 'function') {
      // very old browsers: the same comparison in a new tab
      window.open(urlFor(trigger.dataset.barcode), '_blank', 'noopener');
      return;
    }
    product.textContent = trigger.dataset.title || '';
    dialog.classList.add('is-loading');
    frame.src = urlFor(trigger.dataset.barcode);
    document.body.classList.add('velto-cmpd-open');
    dialog.showModal();
  });
})();
