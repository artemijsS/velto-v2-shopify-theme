/* Velto — living seasonal look (snippets/velto-season.liquid).
   The month (Riga time) is set on <html> by the inline script in the snippet:
   html.velto-season.velto-s-{winter|spring|summer|autumn}.velto-m-{1..12}.
   Colours, header edge, footer "ground" and announcement emojis are pure CSS
   (assets/velto-season.css); this file adds the logo ornament and the
   falling/floating particles (snow, rain, petals, leaves, fireflies…). */
(() => {
  if (window.veltoSeason) return;
  window.veltoSeason = true;

  const root = document.documentElement;
  if (!root.classList.contains('velto-season') || root.classList.contains('velto-hw')) return;

  let D = {};
  try {
    D = JSON.parse((document.getElementById('velto-season-data') || {}).textContent || '{}');
  } catch (e) {}

  const M = +root.dataset.veltoMonth || new Date().getMonth() + 1;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => !matchMedia('(min-width: 990px)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  /* ---------- month setup ---------- */
  const BIRCH = ['#f2c94c', '#e8b931', '#f6d76b', '#d9a521'];
  const MAPLE = ['#e2552b', '#f07a2a', '#c93a22', '#f2a33a', '#e8c13f'];
  const BROWN = ['#a8683a', '#8a5530', '#c08045', '#7a4a2a'];
  const PETAL = ['#ffd1e1', '#ffb7cf', '#fff1f6', '#ffa0c2'];

  const MONTHS = {
    1: { logo: 'flake', fx: [['snow', 70]] },
    2: { logo: 'flake', fx: [['snow', 36], ['sparkle', 12]] },
    3: { logo: 'snowdrop', fx: [['snow', 14], ['drop', 12]] },
    4: { logo: 'sprout', fx: [['rain', 34]] },
    5: { logo: 'blossom', fx: [['petal', 26]] },
    6: { logo: 'sun', fx: [['fluff', 16]] },
    7: { logo: 'shades', fx: [['glint', 22]] },
    8: { logo: 'moon', fx: [['firefly', 20], ['meteor', 1]] },
    9: { logo: 'birch', fx: [['leaf', 12]], leaf: { shape: 'birch', colors: BIRCH } },
    10: { logo: 'maple', fx: [['leaf', 24]], leaf: { shape: 'maple', colors: MAPLE } },
    11: { logo: 'umbrella', fx: [['rain', 40], ['leaf', 5]], leaf: { shape: 'oak', colors: BROWN } },
    12: { logo: 'beanie', fx: [['snow', 44], ['sparkle', 8]] },
  };
  const CFG = MONTHS[M] || MONTHS[1];

  /* ---------- logo ornaments (accent parts use currentColor) ---------- */
  const flakeArm = (a) =>
    `<path transform="rotate(${a} 32 32)" d="M32 32V5M32 13l-6-6M32 13l6-6M32 22l-5-4.5M32 22l5-4.5"/>`;
  const petal = (a) => `<ellipse transform="rotate(${a} 32 32)" cx="32" cy="18" rx="8.5" ry="12" />`;
  const ray = (a) => `<path transform="rotate(${a} 32 32)" d="M32 4v8"/>`;

  const LOGO = {
    flake: `<svg viewBox="0 0 64 64" fill="none" stroke="#eef6ff" stroke-width="3.4" stroke-linecap="round">${[0, 60, 120, 180, 240, 300].map(flakeArm).join('')}<circle cx="32" cy="32" r="3.4" fill="currentColor" stroke="none"/></svg>`,
    snowdrop: `<svg viewBox="0 0 64 64"><path d="M22 62C22 46 26 30 38 18" fill="none" stroke="#6fbf73" stroke-width="3" stroke-linecap="round"/><path d="M22 62C14 50 12 40 16 30c4 8 7 18 6 32Z" fill="#4f9d58"/><path d="M38 18c2 0 4 2 4 4" fill="none" stroke="#6fbf73" stroke-width="2.6" stroke-linecap="round"/><path d="M42 22c-7 2-10 12-6 22 3-4 5-13 6-22Z" fill="#fff"/><path d="M42 22c7 2 10 12 6 22-3-4-5-13-6-22Z" fill="#f2f2f2"/><path d="M42 22c-2 8-2 16 0 24 2-8 2-16 0-24Z" fill="#e6e6e6"/><circle cx="42" cy="22" r="2.6" fill="currentColor"/></svg>`,
    sprout: `<svg viewBox="0 0 64 64"><path d="M32 62V36" stroke="#7cc46a" stroke-width="3.4" stroke-linecap="round"/><path d="M32 40C20 40 11 31 9 19c13 0 22 8 23 21Z" fill="currentColor"/><path d="M32 36c1-14 11-23 25-24-1 14-11 23-25 24Z" fill="#7cc46a"/><path d="M32 40C24 36 18 30 14 23M32 36c6-6 12-12 20-19" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    blossom: `<svg viewBox="0 0 64 64"><g fill="currentColor">${[0, 72, 144, 216, 288].map(petal).join('')}</g><g fill="#fff" opacity=".35">${[0, 72, 144, 216, 288].map((a) => `<ellipse transform="rotate(${a} 32 32)" cx="32" cy="16" rx="3.5" ry="6"/>`).join('')}</g><circle cx="32" cy="32" r="6.5" fill="#ffd447"/><circle cx="32" cy="32" r="3" fill="#f2a33a"/></svg>`,
    sun: `<svg viewBox="0 0 64 64"><g stroke="currentColor" stroke-width="3.6" stroke-linecap="round">${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(ray).join('')}</g><circle cx="32" cy="32" r="13" fill="currentColor"/><circle cx="27" cy="27" r="4" fill="#fff" opacity=".45"/></svg>`,
    shades: `<svg viewBox="0 0 72 32"><path d="M4 7h64" stroke="#f2f2f2" stroke-width="3" stroke-linecap="round"/><path d="M6 7h24l-2 13c-1 5-5 8-10 8h-1c-5 0-9-3-10-8L6 7Zm36 0h24l-1 13c-1 5-5 8-10 8h-1c-5 0-9-3-10-8L42 7Z" fill="#141414" stroke="#f2f2f2" stroke-width="2.4" stroke-linejoin="round"/><path d="M11 11l7 0-6 9M47 11l7 0-6 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".9"/></svg>`,
    moon: `<svg viewBox="0 0 64 64"><path d="M38 6a26 26 0 1 0 20 40A21 21 0 0 1 38 6Z" fill="currentColor"/><circle cx="30" cy="40" r="3" fill="#000" opacity=".12"/><circle cx="22" cy="28" r="2" fill="#000" opacity=".12"/><path d="M52 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff"/></svg>`,
    birch: `<svg viewBox="0 0 64 64"><path d="M32 60V46" stroke="#a87b3a" stroke-width="3" stroke-linecap="round"/><path d="M32 48C16 42 12 26 22 14c3-4 7-7 10-10 3 3 7 6 10 10 10 12 6 28-10 34Z" fill="currentColor"/><path d="M32 48V10M32 22l-7-5M32 22l7-5M32 31l-9-5M32 31l9-5M32 40l-8-5M32 40l8-5" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    maple: `<svg viewBox="0 0 64 64"><path d="M32 4l4 12 8-4-2 12 12-4-4 10 10 4-12 6 2 6-12-2-4 8h-4l-4-8-12 2 2-6-12-6 10-4-4-10 12 4-2-12 8 4Z" fill="currentColor"/><path d="M32 60V22M32 44L18 32M32 44l14-12M32 34l-8-14M32 34l8-14" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    umbrella: `<svg viewBox="0 0 64 64"><path d="M32 3v5" stroke="#f2f2f2" stroke-width="3" stroke-linecap="round"/><path d="M32 30v20c0 6-8 6-8 0" fill="none" stroke="#f2f2f2" stroke-width="3" stroke-linecap="round"/><path d="M5 30C5 16 17 7 32 7s27 9 27 23c-4-4-10-4-13.5 0-3.5-4-10-4-13.5 0-3.5-4-10-4-13.5 0C14.5 26 9 26 5 30Z" fill="currentColor"/><path d="M32 7c-6 6-8 14-8.5 23M32 7c6 6 8 14 8.5 23" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.6"/></svg>`,
    beanie: `<svg viewBox="0 0 64 64"><path d="M10 46c0-20 10-32 22-32s22 12 22 32Z" fill="#f2f2f2"/><path d="M12 33c13-4 27-4 40 0l1 5c-13-4-29-4-42 0Z" fill="currentColor"/><rect x="7" y="43" width="50" height="13" rx="5" fill="currentColor"/><path d="M14 46v7M20 46v7M26 46v7M32 46v7M38 46v7M44 46v7M50 46v7" stroke="rgba(0,0,0,.22)" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="11" r="8" fill="#fff"/></svg>`,
  };

  const ornament = () => {
    if (D.logo === false || !LOGO[CFG.logo]) return;
    document.querySelectorAll('.header__heading-logo-wrapper').forEach((w) => {
      if (w.querySelector('.velto-season-deco')) return;
      const s = document.createElement('span');
      s.className = `velto-season-deco velto-season-deco--${CFG.logo}`;
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = LOGO[CFG.logo];
      w.appendChild(s);
    });
  };

  /* ---------- particles ---------- */
  const particles = () => {
    if (reduce || D.particles === false) return;
    const amount = { less: 0.6, normal: 1, more: 1.5 }[D.amount] || 1;
    const accent = (getComputedStyle(root).getPropertyValue('--vs') || '255,255,255').trim();

    const canvas = document.createElement('canvas');
    canvas.className = 'velto-season-fx';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, phone = isPhone();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      phone = isPhone();
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // soft round sprite (snow, glints, fireflies)
    const sprite = (rgb, hard) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, `rgba(${rgb},1)`);
      r.addColorStop(hard, `rgba(${rgb},0.85)`);
      r.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      return c;
    };
    const SNOW = sprite('255,255,255', 0.45);
    const GLINT_A = sprite(accent, 0.15);
    const GLINT_W = sprite('255,240,210', 0.15);
    const FIRE = sprite('226,255,120', 0.12);

    const MAPLE_PATH = new Path2D(
      'M0-28l4 12 8-4-2 12 12-4-4 10 10 4-12 6 2 6-12-2-4 8h-4l-4-8-12 2 2-6-12-6 10-4-4-10 12 4-2-12 8 4Z'
    );
    const leafCfg = CFG.leaf || { shape: 'birch', colors: BIRCH };

    const T = {
      snow: {
        init(p, fresh) {
          p.r = rnd(0.8, 2.9);
          p.x = rnd(0, W);
          p.y = fresh ? rnd(0, H) : rnd(-20, -5);
          p.vy = 0.3 + p.r * 0.22;
          p.f = rnd(0.0006, 0.0014);
          p.ph = rnd(0, 6.28);
          p.a = 0.35 + (p.r / 2.9) * 0.55;
        },
        step(p, k, t, wind) {
          p.y += p.vy * k;
          p.x += (Math.sin(t * p.f + p.ph) * 0.35 + wind) * k;
          return p.y < H + 10;
        },
        draw(p) {
          const s = p.r * 2.6;
          ctx.globalAlpha = p.a;
          ctx.drawImage(SNOW, p.x - s, p.y - s, s * 2, s * 2);
        },
      },
      sparkle: {
        init(p) {
          p.x = rnd(0, W);
          p.y = rnd(0, H);
          p.s = rnd(2.5, 5.5);
          p.f = rnd(0.0012, 0.0028);
          p.ph = rnd(0, 6.28);
          p.c = Math.random() < 0.5 ? '255,255,255' : accent;
          p.life = rnd(400, 900);
        },
        step(p, k) {
          p.y += 0.08 * k;
          p.life -= k;
          return p.life > 0 && p.y < H + 10;
        },
        draw(p, t) {
          const a = Math.pow((Math.sin(t * p.f + p.ph) + 1) / 2, 3);
          if (a < 0.02) return;
          const s = p.s * (0.6 + a * 0.6);
          ctx.globalAlpha = a * 0.9;
          ctx.strokeStyle = `rgb(${p.c})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y);
          ctx.lineTo(p.x + s, p.y);
          ctx.moveTo(p.x, p.y - s);
          ctx.lineTo(p.x, p.y + s);
          ctx.stroke();
        },
      },
      drop: {
        init(p, fresh) {
          p.x = rnd(0, W);
          p.y = fresh ? rnd(0, H) : rnd(-60, -10);
          p.vy = rnd(3.5, 6);
          p.l = rnd(5, 9);
          p.a = rnd(0.25, 0.45);
        },
        step(p, k) {
          p.y += p.vy * k;
          return p.y < H + 20;
        },
        draw(p) {
          ctx.globalAlpha = p.a;
          ctx.strokeStyle = 'rgb(200,230,255)';
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - p.l);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        },
      },
      rain: {
        init(p, fresh) {
          p.x = rnd(-60, W + 20);
          p.y = fresh ? rnd(0, H) : rnd(-80, -10);
          p.v = rnd(8, 13);
          p.l = rnd(12, 22);
          p.a = rnd(0.1, 0.24);
        },
        step(p, k, t, wind) {
          p.y += p.v * k;
          p.x += (p.v * 0.16 + wind) * k;
          return p.y < H + 30;
        },
        draw(p) {
          ctx.globalAlpha = p.a;
          ctx.strokeStyle = 'rgb(210,225,240)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - p.l * 0.16, p.y - p.l);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        },
      },
      petal: {
        init(p, fresh) {
          p.x = rnd(-20, W);
          p.y = fresh ? rnd(0, H) : rnd(-30, -10);
          p.s = rnd(4, 7.5);
          p.vy = rnd(0.55, 1.05);
          p.f = rnd(0.0008, 0.0016);
          p.ph = rnd(0, 6.28);
          p.rot = rnd(0, 6.28);
          p.vr = rnd(-0.03, 0.03);
          p.c = pick(PETAL);
          p.a = rnd(0.6, 0.9);
        },
        step(p, k, t, wind) {
          p.y += p.vy * k;
          p.x += (Math.sin(t * p.f + p.ph) * 0.9 + 0.25 + wind) * k;
          p.rot += p.vr * k;
          return p.y < H + 20 && p.x < W + 30;
        },
        draw(p, t) {
          const s = p.s;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.35 + Math.abs(Math.cos(t * p.f * 2 + p.ph)) * 0.65);
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.quadraticCurveTo(s * 0.35, -s * 0.7, s * 0.25, -s);
          ctx.bezierCurveTo(s * 1.05, -s * 0.6, s * 0.7, s * 0.8, 0, s);
          ctx.bezierCurveTo(-s * 0.7, s * 0.8, -s * 1.05, -s * 0.6, -s * 0.25, -s);
          ctx.quadraticCurveTo(-s * 0.35, -s * 0.7, 0, -s);
          ctx.fill();
          ctx.restore();
        },
      },
      fluff: {
        init(p, fresh) {
          p.x = fresh ? rnd(0, W) : rnd(-40, -10);
          p.y = rnd(H * 0.1, H);
          p.s = rnd(5, 9);
          p.vx = rnd(0.25, 0.6);
          p.vy = rnd(-0.22, -0.04);
          p.f = rnd(0.0007, 0.0014);
          p.ph = rnd(0, 6.28);
          p.a = rnd(0.45, 0.75);
        },
        step(p, k, t, wind) {
          p.x += (p.vx + wind) * k;
          p.y += (p.vy + Math.sin(t * p.f + p.ph) * 0.25) * k;
          return p.x < W + 30 && p.y > -30;
        },
        draw(p, t) {
          const s = p.s;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.sin(t * p.f + p.ph) * 0.35);
          ctx.globalAlpha = p.a;
          ctx.strokeStyle = '#fff';
          ctx.fillStyle = '#fff';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, s * 1.5);
          for (let i = 0; i < 9; i++) {
            const a = Math.PI + (i / 8) * Math.PI;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          }
          ctx.stroke();
          ctx.globalAlpha = p.a * 0.8;
          ctx.fillRect(-0.9, s * 1.5 - 0.5, 1.8, 2.6);
          ctx.restore();
        },
      },
      glint: {
        init(p, fresh) {
          p.x = rnd(0, W);
          p.y = fresh ? rnd(0, H) : H + rnd(10, 40);
          p.r = rnd(5, 20);
          p.vy = -rnd(0.12, 0.38);
          p.f = rnd(0.0008, 0.0018);
          p.ph = rnd(0, 6.28);
          p.img = Math.random() < 0.55 ? GLINT_A : GLINT_W;
        },
        step(p, k, t, wind) {
          p.y += p.vy * k;
          p.x += (Math.sin(t * p.f + p.ph) * 0.2 + wind * 0.5) * k;
          return p.y > -40;
        },
        draw(p, t) {
          ctx.globalAlpha = 0.06 + ((Math.sin(t * p.f * 1.7 + p.ph) + 1) / 2) * 0.14;
          ctx.drawImage(p.img, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        },
      },
      firefly: {
        init(p) {
          p.x = rnd(0, W);
          p.y = rnd(H * 0.2, H);
          p.dir = rnd(0, 6.28);
          p.v = rnd(0.2, 0.45);
          p.f = rnd(0.0012, 0.003);
          p.ph = rnd(0, 6.28);
        },
        step(p, k) {
          p.dir += rnd(-0.08, 0.08) * k;
          p.x += Math.cos(p.dir) * p.v * k;
          p.y += Math.sin(p.dir) * p.v * k;
          if (p.x < -20) p.x = W + 10;
          if (p.x > W + 20) p.x = -10;
          if (p.y < H * 0.1) p.dir = Math.abs(p.dir);
          if (p.y > H + 10) p.dir = -Math.abs(p.dir);
          return true;
        },
        draw(p, t) {
          const a = Math.pow((Math.sin(t * p.f + p.ph) + 1) / 2, 2);
          ctx.globalAlpha = 0.15 + a * 0.75;
          const s = 7 + a * 5;
          ctx.drawImage(FIRE, p.x - s, p.y - s, s * 2, s * 2);
        },
      },
      meteor: {
        init(p) {
          p.wait = rnd(240, 700);
          p.on = false;
        },
        step(p, k) {
          if (!p.on) {
            p.wait -= k;
            if (p.wait <= 0) {
              p.on = true;
              p.x = rnd(W * 0.3, W * 1.05);
              p.y = rnd(-10, H * 0.3);
              p.v = rnd(11, 16);
              p.life = p.max = rnd(45, 70);
            }
            return true;
          }
          p.x -= p.v * 0.86 * k;
          p.y += p.v * 0.5 * k;
          p.life -= k;
          if (p.life <= 0) T.meteor.init(p);
          return true;
        },
        draw(p) {
          if (!p.on) return;
          const a = Math.min(1, p.life / 15) * Math.min(1, (p.max - p.life) / 6);
          const tx = p.x + 130 * 0.86, ty = p.y - 130 * 0.5;
          const g = ctx.createLinearGradient(p.x, p.y, tx, ty);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = a;
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        },
      },
      leaf: {
        init(p, fresh) {
          p.x = rnd(-30, W);
          p.y = fresh ? rnd(0, H) : rnd(-40, -15);
          p.s = leafCfg.shape === 'maple' ? rnd(7, 12) : rnd(5, 9);
          p.vy = rnd(0.6, 1.25);
          p.f = rnd(0.0006, 0.0013);
          p.ph = rnd(0, 6.28);
          p.rot = rnd(0, 6.28);
          p.vr = rnd(-0.035, 0.035);
          p.c = pick(leafCfg.colors);
          p.a = rnd(0.7, 0.95);
        },
        step(p, k, t, wind) {
          p.y += p.vy * k;
          p.x += (Math.sin(t * p.f + p.ph) * 1.4 + 0.2 + wind * 1.3) * k;
          p.rot += (p.vr + Math.sin(t * p.f + p.ph) * 0.01) * k;
          return p.y < H + 30 && p.x < W + 40;
        },
        draw(p, t) {
          const s = p.s;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(0.3 + Math.abs(Math.cos(t * p.f * 2.2 + p.ph)) * 0.7, 1);
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.c;
          if (leafCfg.shape === 'maple') {
            ctx.scale(s / 28, s / 28);
            ctx.fill(MAPLE_PATH);
          } else {
            const w = leafCfg.shape === 'oak' ? 0.75 : 0.62;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.bezierCurveTo(s * w * 1.3, -s * 0.45, s * w, s * 0.6, 0, s);
            ctx.bezierCurveTo(-s * w, s * 0.6, -s * w * 1.3, -s * 0.45, 0, -s);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(0, -s * 0.8);
            ctx.lineTo(0, s * 1.3);
            ctx.stroke();
          }
          ctx.restore();
        },
      },
    };

    const area = Math.min(1.3, Math.max(0.35, (W * H) / (1440 * 900)));
    const list = [];
    CFG.fx.forEach(([type, base]) => {
      const n = type === 'meteor' ? 1 : Math.max(2, Math.round(base * amount * area));
      for (let i = 0; i < n; i++) {
        const p = { type, kx: 0, ky: 0 };
        T[type].init(p, true);
        list.push(p);
      }
    });

    // the cursor gently pushes snow, petals and leaves aside
    let mx = -999, my = -999;
    const PUSH = { snow: 1, petal: 1, leaf: 1, fluff: 1, sparkle: 0.4, glint: 0.6 };
    if (matchMedia('(hover: hover)').matches) {
      addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
      document.addEventListener('pointerleave', () => { mx = my = -999; });
    }

    let last = 0, raf = 0, odd = false;
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      if (phone && (odd = !odd)) return; // ~30 fps on phones — kinder to batteries
      const k = Math.min(3, last ? (t - last) / 16.667 : 1);
      last = t;
      const wind = Math.sin(t * 0.00017) * 0.25 + Math.sin(t * 0.00053) * 0.12;
      ctx.clearRect(0, 0, W, H);
      for (const p of list) {
        const ty = T[p.type];
        if (!ty.step(p, k, t, wind)) {
          ty.init(p, false);
          p.kx = p.ky = 0;
        }
        const f = PUSH[p.type];
        if (f && mx > -999) {
          const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy);
          if (d < 90 && d > 0.1) {
            const q = (1 - d / 90) * 0.9 * f;
            p.kx += (dx / d) * q;
            p.ky += (dy / d) * q;
          }
        }
        if (p.kx || p.ky) {
          p.x += p.kx * k;
          p.y += p.ky * k;
          p.kx *= 0.92;
          p.ky *= 0.92;
          if (Math.abs(p.kx) + Math.abs(p.ky) < 0.01) p.kx = p.ky = 0;
        }
        ty.draw(p, t);
      }
      ctx.globalAlpha = 1;
    };

    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    addEventListener('resize', resize, { passive: true });

    // calmer over the products once you scroll down
    const onScroll = () => canvas.classList.toggle('is-calm', scrollY > H * 0.7);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    start();
  };

  const run = () => {
    ornament();
    particles();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
