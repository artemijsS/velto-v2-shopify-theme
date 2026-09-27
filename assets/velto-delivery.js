/* Velto — weekly delivery schedule, calculated live in Riga time.

   Rule (theme settings → "Velto piegāde"): orders are accepted until the
   cutoff (default: Tuesday 23:59); the order is delivered on one of the
   delivery days that follow (default: Friday–Sunday), at a day and
   time slot the customer picks at checkout. After the cutoff, new orders
   go to the next week's cycle.

   <velto-delivery data-cutoff-day="2" data-cutoff-time="23:59"
                   data-delivery-days="5,6,7" data-variant="line|card">
     [data-v="countdown"] [data-v="deadline"] [data-v="days"] [data-v="sentence"]
     .velto-week__day[data-dow="1..7"]
   </velto-delivery>
   Weekdays are ISO: 1 = Monday … 7 = Sunday. */
(() => {
  const L = {
    lv: {
      // dative for "līdz …", locative for "piegāde …"
      until: ['', 'pirmdienai', 'otrdienai', 'trešdienai', 'ceturtdienai', 'piektdienai', 'sestdienai', 'svētdienai'],
      on: ['', 'pirmdien', 'otrdien', 'trešdien', 'ceturtdien', 'piektdien', 'sestdien', 'svētdien'],
      months: ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'],
      date: (dow, d, m) => `${L.lv.on[dow]}, ${d}. ${L.lv.months[m]}`,
      or: 'vai',
      // consecutive days: "piektdien–svētdien, 2.–4. oktobrī"
      range: (a, b) =>
        a.getUTCMonth() === b.getUTCMonth()
          ? `${L.lv.on[isoDow(a)]}–${L.lv.on[isoDow(b)]}, ${a.getUTCDate()}.–${b.getUTCDate()}. ${L.lv.months[a.getUTCMonth()]}`
          : `${L.lv.on[isoDow(a)]}–${L.lv.on[isoDow(b)]}, ${a.getUTCDate()}. ${L.lv.months[a.getUTCMonth()]} – ${b.getUTCDate()}. ${L.lv.months[b.getUTCMonth()]}`,
      deadline: (dow, t) => `līdz ${L.lv.until[dow]} ${t}`,
      sentence: (dl, days) => `Pasūti ${dl} — piegāde ${days}.`,
      units: ['d', 'st', 'min'],
      today: 'šodien',
    },
    ru: {
      until: ['', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы', 'воскресенья'],
      on: ['', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'],
      months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
      date: (dow, d, m) => `${L.ru.on[dow]}, ${d} ${L.ru.months[m]}`,
      or: 'или',
      // "с пятницы по воскресенье, 2–4 октября"
      from: ['', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы', 'воскресенья'],
      to: ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'],
      range: (a, b) =>
        `с ${L.ru.from[isoDow(a)]} по ${L.ru.to[isoDow(b)]}, ` +
        (a.getUTCMonth() === b.getUTCMonth()
          ? `${a.getUTCDate()}–${b.getUTCDate()} ${L.ru.months[a.getUTCMonth()]}`
          : `${a.getUTCDate()} ${L.ru.months[a.getUTCMonth()]} – ${b.getUTCDate()} ${L.ru.months[b.getUTCMonth()]}`),
      deadline: (dow, t) => `до ${L.ru.until[dow]} ${t}`,
      sentence: (dl, days) => `Закажите ${dl} — доставка ${days}.`,
      units: ['д', 'ч', 'мин'],
      today: 'сегодня',
    },
    en: {
      until: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      on: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      date: (dow, d, m) => `${L.en.on[dow]}, ${d} ${L.en.months[m]}`,
      or: 'or',
      range: (a, b) =>
        `${L.en.on[isoDow(a)]}–${L.en.on[isoDow(b)]}, ` +
        (a.getUTCMonth() === b.getUTCMonth()
          ? `${a.getUTCDate()}–${b.getUTCDate()} ${L.en.months[a.getUTCMonth()]}`
          : `${a.getUTCDate()} ${L.en.months[a.getUTCMonth()]} – ${b.getUTCDate()} ${L.en.months[b.getUTCMonth()]}`),
      deadline: (dow, t) => `by ${L.en.until[dow]} ${t}`,
      sentence: (dl, days) => `Order ${dl} — delivered ${days}.`,
      units: ['d', 'h', 'min'],
      today: 'today',
    },
  };

  const TZ = 'Europe/Riga';
  const DAY = 864e5;

  // Riga wall-clock "now" as a UTC-based Date (so getUTC* = Riga fields).
  function rigaNow() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date()).map((p) => [p.type, p.value])
    );
    return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second));
  }

  const isoDow = (d) => ((d.getUTCDay() + 6) % 7) + 1;

  function schedule(cutoffDow, cutoffTime, deliveryDows) {
    const now = rigaNow();
    const [hh, mm] = cutoffTime.split(':').map((n) => parseInt(n, 10) || 0);
    const today0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let cutoff = new Date(today0 + ((cutoffDow - isoDow(now) + 7) % 7) * DAY + (hh * 60 + mm) * 6e4 + 59e3);
    if (cutoff <= now) cutoff = new Date(cutoff.getTime() + 7 * DAY);
    const cutoffDay0 = Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate());
    const deliveries = deliveryDows
      .map((dow) => {
        const off = (dow - cutoffDow + 7) % 7 || 7;
        return new Date(cutoffDay0 + off * DAY);
      })
      .sort((a, b) => a - b);
    return { now, cutoff, deliveries };
  }

  function countdown(ms, units) {
    const mins = Math.max(0, Math.floor(ms / 6e4));
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const out = [];
    if (d) out.push(`${d} ${units[0]}`);
    if (d || h) out.push(`${h} ${units[1]}`);
    out.push(`${m} ${units[2]}`);
    return out.join(' ');
  }

  if (customElements.get('velto-delivery')) return;

  customElements.define(
    'velto-delivery',
    class extends HTMLElement {
      connectedCallback() {
        const lang = (document.documentElement.lang || 'lv').slice(0, 2);
        this.t = L[lang] || L.lv;
        this.cutoffDow = parseInt(this.dataset.cutoffDay, 10) || 2;
        this.cutoffTime = this.dataset.cutoffTime || '23:59';
        this.deliveryDows = (this.dataset.deliveryDays || '5,6,7').split(',').map((n) => parseInt(n, 10)).filter(Boolean);
        this.update();
        this.timer = setInterval(() => this.update(), 30000);
      }

      disconnectedCallback() {
        clearInterval(this.timer);
      }

      set(key, text) {
        this.querySelectorAll(`[data-v="${key}"]`).forEach((el) => (el.textContent = text));
      }

      update() {
        const t = this.t;
        const { now, cutoff, deliveries } = schedule(this.cutoffDow, this.cutoffTime, this.deliveryDows);
        const deadline = t.deadline(this.cutoffDow, this.cutoffTime);
        const fmt = (d) => t.date(isoDow(d), d.getUTCDate(), d.getUTCMonth());
        const consecutive =
          deliveries.length > 2 &&
          deliveries.every((d, i) => i === 0 || d - deliveries[i - 1] === DAY);
        const days = consecutive
          ? t.range(deliveries[0], deliveries[deliveries.length - 1])
          : deliveries.map(fmt).join(` ${t.or} `);
        const daysLines = consecutive ? days : deliveries.map(fmt).join(`\n${t.or} `);

        this.set('countdown', countdown(cutoff - now, t.units));
        this.set('deadline', deadline);
        this.set('days', days);
        this.set('days-lines', daysLines);
        this.set('sentence', t.sentence(deadline, days));

        // week strip: mark today
        const today = isoDow(now);
        this.querySelectorAll('.velto-week__day').forEach((el) => {
          el.classList.toggle('is-today', +el.dataset.dow === today);
        });

        // urgency (< 24h left)
        this.classList.toggle('is-urgent', cutoff - now < DAY);
        this.classList.add('is-ready');
      }
    }
  );
})();
