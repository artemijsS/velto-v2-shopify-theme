/* Velto — map on the "Delivery and pickup" page: delivery zones (coloured
   polygons, the same colours as the list next to the map) and pickup points.
   Needs the Google Maps key from theme settings → "Velto: sava piegāde";
   without it the page simply has no map. Zone polygons are parsed by
   VeltoFulfilGeo (assets/velto-fulfil.js). */
(() => {
  const host = document.querySelector('[data-velto-fmap]');
  const src = document.querySelector('[data-velto-fmap-config]');
  if (!host || !src) return;
  let cfg;
  try {
    cfg = JSON.parse(src.textContent);
  } catch (e) {
    return;
  }
  const geo = window.VeltoFulfilGeo;
  if (!cfg.mapsKey || !geo) {
    host.remove();
    return;
  }

  const load = () =>
    new Promise((resolve, reject) => {
      if (window.google && google.maps && google.maps.importLibrary) return resolve();
      const cb = `__veltoMap${Date.now()}`;
      window[cb] = resolve;
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.mapsKey)}&loading=async&language=${encodeURIComponent(cfg.locale)}&region=LV&callback=${cb}`;
      s.async = true;
      s.onerror = reject;
      document.head.appendChild(s);
    });

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  // Card shown on the map for a zone or a pickup point.
  // o = { label, color?, badge?, title, text?, price?, href? }
  const card = (o, onClose) => {
    const box = el('div', 'velto-fpage__pop');
    const close = el('button', 'velto-fpage__pop-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', cfg.close);
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose();
    });
    const head = el('div', 'velto-fpage__pop-label');
    if (o.color) {
      const sw = el('span', 'velto-fpage__pop-swatch');
      sw.style.setProperty('--c', o.color);
      head.appendChild(sw);
    }
    head.appendChild(el('span', '', o.label));
    box.append(close, head, el('strong', 'velto-fpage__pop-title', o.title));
    if (o.text) box.appendChild(el('span', 'velto-fpage__pop-text', o.text));
    if (o.price) box.appendChild(el('span', 'velto-fpage__pop-price', o.price));
    if (o.badge) box.appendChild(el('span', 'velto-fpage__pop-badge', o.badge));
    if (o.href) {
      const link = el('a', 'velto-fpage__pop-link', cfg.route);
      link.href = o.href;
      link.target = '_blank';
      link.rel = 'noopener';
      box.appendChild(link);
    }
    box.addEventListener('click', (e) => e.stopPropagation());
    return box;
  };

  async function pointPosition(p) {
    const m = String(p.coords || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    if (!p.address) return null;
    // no coordinates in the metaobject: look the address up
    const { Place } = await google.maps.importLibrary('places');
    const { places } = await Place.searchByText({ textQuery: p.address, fields: ['location'], maxResultCount: 1, region: 'lv' });
    const loc = places && places[0] && places[0].location;
    return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
  }

  async function init() {
    await load();
    const { Map, InfoWindow } = await google.maps.importLibrary('maps');
    const map = new Map(host, {
      center: { lat: 56.95, lng: 24.11 },
      zoom: 10,
      mapId: 'DEMO_MAP_ID',
      colorScheme: 'DARK',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });
    // Our own popup (a marker whose content is the card) — the stock Google
    // info window is a white bubble that does not fit the dark site.
    let Adv = null;
    try {
      Adv = (await google.maps.importLibrary('marker')).AdvancedMarkerElement;
    } catch (e) {
      /* falls back to the stock info window and marker */
    }
    const info = new InfoWindow();
    let popup = null;
    const hide = () => {
      if (popup) popup.map = null;
      popup = null;
      info.close();
    };
    const show = (pos, o, above) => {
      hide();
      const node = card(o, hide);
      if (Adv) {
        if (above) node.classList.add('velto-fpage__pop--above');
        popup = new Adv({ map, position: pos, content: node, zIndex: 100, gmpClickable: true });
      } else {
        info.setContent(node);
        info.setPosition(pos);
        info.open({ map });
      }
    };
    map.addListener('click', hide);
    const bounds = new google.maps.LatLngBounds();
    let any = false;

    // Cheapest zone first. Where zones overlap, the cheaper one wins (same rule as the
    // cart), so every dearer zone is drawn with the cheaper ones cut out of it — the
    // colours never blend. Cutting needs assets/velto-polygon-clipping.min.js; without it
    // the cheaper zones are simply stacked on top.
    const pc = window.polygonClipping;
    const zones = (cfg.zones || [])
      .map((z) => ({ ...z, pts: geo.polygonPoints(z.polygon) }))
      .filter((z) => z.pts.length > 2)
      .sort((a, b) => (Number(a.cents) || 0) - (Number(b.cents) || 0));
    const ring = (pts) => {
      const r = pts.map(([lat, lng]) => [lng, lat]);
      const f = r[0], l = r[r.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) r.push([f[0], f[1]]);
      return r;
    };
    const cheaper = []; // geometries of the zones already drawn

    zones.forEach((z, i) => {
      z.pts.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      any = true;
      // list of polygons, each a list of rings (outer first, then holes) of {lat, lng}
      let shapes = [[z.pts.map(([lat, lng]) => ({ lat, lng }))]];
      if (pc) {
        try {
          const own = [[ring(z.pts)]];
          const cut = cheaper.length ? pc.difference(own, ...cheaper) : own;
          shapes = cut.map((poly) => poly.map((r) => r.map(([lng, lat]) => ({ lat, lng }))));
          cheaper.push(own);
        } catch (e) {
          console.error('[velto-fulfil-page] zone overlap', e);
        }
      }
      shapes.forEach((paths) => {
        const poly = new google.maps.Polygon({
          paths,
          map,
          strokeColor: z.color,
          strokeWeight: 2,
          strokeOpacity: 0.9,
          fillColor: z.color,
          fillOpacity: 0.22,
          zIndex: zones.length - i,
        });
        poly.addListener('click', (e) => {
          show(e.latLng, { label: cfg.zoneLabel, color: z.color, title: z.name, price: z.price || cfg.free });
        });
      });
    });

    for (const p of cfg.points || []) {
      let pos = null;
      try {
        pos = await pointPosition(p);
      } catch (e) {
        console.error('[velto-fulfil-page] pickup point', e);
      }
      if (!pos) continue;
      bounds.extend(pos);
      any = true;
      const href = p.url || (p.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}` : '');
      const open = () => show(pos, { label: cfg.pickupLabel, badge: cfg.free, title: p.name, text: p.address, href }, true);
      if (Adv) {
        // a pin with the Velto logo instead of the stock red marker
        // (the point's name stays as the tooltip and in the card that opens on click)
        const pin = el('div', 'velto-fpage__marker');
        if (cfg.logo) {
          const img = el('img', 'velto-fpage__marker-logo');
          img.src = cfg.logo;
          img.alt = p.name;
          // logo failed to load → fall back to the name
          img.onerror = () => img.replaceWith(el('span', 'velto-fpage__marker-name', p.name));
          pin.append(img);
        } else {
          pin.append(el('span', 'velto-fpage__marker-name', p.name));
        }
        new Adv({ map, position: pos, title: p.name, content: pin, zIndex: 10 }).addListener('gmp-click', open);
      } else if (google.maps.Marker) {
        new google.maps.Marker({ map, position: pos, title: p.name }).addListener('click', open);
      }
    }

    if (any) map.fitBounds(bounds, 48);
  }

  init().catch((e) => {
    console.error('[velto-fulfil-page] map', e);
    host.remove();
  });
})();
