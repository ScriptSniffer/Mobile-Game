/* ==========================================================================
   Cookie Clicker Light – Spiellogik & Benutzeroberfläche
   --------------------------------------------------------------------------
   Benötigt js/config.js (Spieldaten), das vorher geladen wird.

   Inhalt:
     1.  Hilfsfunktionen
     2.  Keks-Grafik (SVG)
     3.  Spielstand: erstellen, laden, speichern
     4.  Berechnungen: Produktion, Klickwert, Preise
     5.  Aktionen: klicken & kaufen
     6.  Goldene Kekse & Boni
     7.  Erfolge
     8.  Oberfläche: Zähler, Shop, Boni, News, Toasts
     9.  Dialoge: Neues Spiel, Umbenennen, Statistik
     10. Effekte: Schwebetext, Krümel, Keksregen
     11. Spielschleife & Start
   ========================================================================== */
(() => {
  'use strict';

  /* ======================================================================
     1. Hilfsfunktionen
     ====================================================================== */

  const $ = (selector) => document.querySelector(selector);
  const rand = (min, max) => min + Math.random() * (max - min);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));
  const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
  const DEFAULT_BAKERY_NAME = 'Meine Bäckerei';

  // Formatierer einmalig anlegen – toLocaleString() in jedem Frame wäre teuer.
  const FORMAT_INT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const FORMAT_1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  const FORMAT_3 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
  const BIG_SUFFIXES = ['Mio.', 'Mrd.', 'Bio.', 'Brd.', 'Trio.', 'Trd.', 'Quadr.', 'Quadrd.', 'Quint.', 'Quintd.'];

  /**
   * Formatiert Zahlen deutsch und platzsparend:
   *   12.345 · 0,1 (mit Nachkommastelle) · 1,234 Mio. · 5,6 Mrd. …
   */
  function formatNumber(value, withDecimal = false) {
    if (!Number.isFinite(value)) return '∞';
    if (value < 1e6) {
      return withDecimal ? FORMAT_1.format(value) : FORMAT_INT.format(Math.floor(value));
    }
    const group = Math.floor(Math.log10(value) / 3); // 2 = Millionen, 3 = Milliarden, …
    const suffix = BIG_SUFFIXES[group - 2];
    if (!suffix) return value.toExponential(2).replace('.', ',');
    return `${FORMAT_3.format(value / 10 ** (group * 3))} ${suffix}`;
  }

  /** Raten (pro Sekunde / pro Klick): kleine Werte mit einer Nachkommastelle, z. B. „0,1“. */
  const formatRate = (value) => formatNumber(value, value < 100);

  /** Sekunden → „2 Std. 5 Min.“ */
  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const parts = [];
    if (days) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`);
    if (hours) parts.push(`${hours} Std.`);
    if (minutes && !days) parts.push(`${minutes} Min.`);
    if (!days && !hours) parts.push(`${s % 60} Sek.`);
    return parts.join(' ');
  }

  /** Text nur setzen, wenn er sich geändert hat (spart DOM-Arbeit im Game-Loop). */
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  /** Wählt zufällig einen Eintrag anhand seines `weight`. */
  function pickWeighted(items) {
    let roll = Math.random() * items.reduce((sum, item) => sum + item.weight, 0);
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Kleiner deterministischer Zufallsgenerator – so sieht der Keks immer gleich aus. */
  function seededRandom(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Kurze Animation über die Web Animations API (falls verfügbar). */
  function animate(el, keyframes, options) {
    if (!prefersReducedMotion && el && typeof el.animate === 'function') el.animate(keyframes, options);
  }

  const shake = (el) => animate(el, [
    { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' },
    { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
  ], { duration: 280, easing: 'ease-out' });

  const pop = (el) => animate(el, [
    { transform: 'scale(1.6)', color: '#f5b45e' }, { transform: 'scale(1)' },
  ], { duration: 380, easing: 'cubic-bezier(.2, 1.6, .4, 1)' });

  /* ======================================================================
     2. Keks-Grafik (SVG)
     Der Keks wird per Code gezeichnet: unregelmäßiger Rand, Schokostücke,
     Risse und ein Glanzlicht. Dieselbe Grafik nutzen wir für den großen
     Keks, goldene Kekse und den Keksregen im Hintergrund.
     ====================================================================== */

  const COOKIE_PALETTES = {
    classic: {
      light: '#f8d592', mid: '#dea15a', dark: '#a8662d', edge: '#7a4419',
      chipLight: '#7a4426', chipDark: '#2a1308', crack: 'rgba(110, 60, 25, .35)', shine: 0.14,
    },
    golden: {
      light: '#fff7c9', mid: '#ffd34d', dark: '#d99a06', edge: '#a86f00',
      chipLight: '#fff9dc', chipDark: '#e3a90f', crack: 'rgba(160, 100, 0, .35)', shine: 0.3,
    },
  };

  // Schokostücke: [x-Versatz, y-Versatz, Radius] relativ zur Keksmitte
  const CHIPS = [
    [-40, -40, 13], [18, -54, 11], [50, -14, 12], [-60, 4, 10], [-10, -8, 14], [28, 30, 13],
    [-32, 44, 11], [6, 64, 9], [60, 30, 8], [-6, -72, 7], [-64, -32, 7], [44, -50, 6],
  ];
  const CRACKS = ['M46 92q8-8 17-3', 'M116 68q7 8 15 5', 'M88 134q10 5 17-3', 'M132 116q4 10 13 11', 'M66 150q7-7 15-4', 'M100 40q6 5 4 13'];

  /** Punkte auf einem leicht zufällig verbeulten Kreis. */
  function blobPoints(cx, cy, radius, count, jitter, random) {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const r = radius * (1 + (random() - 0.5) * jitter);
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    });
  }

  /** Weicher, geschlossener SVG-Pfad durch alle Punkte (quadratische Kurven über Mittelpunkte). */
  function smoothClosedPath(points) {
    const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = `M${fmt(mid(points[points.length - 1], points[0]))}`;
    points.forEach((point, i) => {
      d += ` Q${fmt(point)} ${fmt(mid(point, points[(i + 1) % points.length]))}`;
    });
    return `${d}Z`;
  }

  function createCookieSVG(variant = 'classic', idPrefix = variant) {
    const p = COOKIE_PALETTES[variant];
    const random = seededRandom(variant === 'golden' ? 7 : 1337);
    const dough = smoothClosedPath(blobPoints(100, 100, 92, 30, 0.06, random));
    const chips = CHIPS
      .map(([dx, dy, r]) => `<path d="${smoothClosedPath(blobPoints(100 + dx, 100 + dy, r, 7, 0.5, random))}"/>`)
      .join('');
    const cracks = CRACKS.map((d) => `<path d="${d}"/>`).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="${idPrefix}-dough" cx="40%" cy="35%" r="70%">
          <stop offset="0" stop-color="${p.light}"/>
          <stop offset=".55" stop-color="${p.mid}"/>
          <stop offset="1" stop-color="${p.dark}"/>
        </radialGradient>
        <radialGradient id="${idPrefix}-chip" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="${p.chipLight}"/>
          <stop offset="1" stop-color="${p.chipDark}"/>
        </radialGradient>
      </defs>
      <path d="${dough}" fill="url(#${idPrefix}-dough)" stroke="${p.edge}" stroke-width="3"/>
      <g fill="none" stroke="${p.crack}" stroke-width="2.5" stroke-linecap="round">${cracks}</g>
      <g fill="url(#${idPrefix}-chip)">${chips}</g>
      <ellipse cx="74" cy="64" rx="40" ry="22" fill="#fff" opacity="${p.shine}" transform="rotate(-32 74 64)"/>
    </svg>`;
  }

  const GOLDEN_COOKIE_SVG = createCookieSVG('golden', 'gold');

  /* ======================================================================
     3. Spielstand: erstellen, laden, speichern
     ====================================================================== */

  let state = null;

  function createInitialState() {
    const now = Date.now();
    return {
      version: CONFIG.SAVE_VERSION,
      bakeryName: DEFAULT_BAKERY_NAME,
      cookies: 0,          // aktueller Kontostand
      totalBaked: 0,       // alle jemals gebackenen Kekse (sinkt nie)
      handmade: 0,         // davon per Klick gebacken
      clicks: 0,
      goldenClicks: 0,
      buildings: Object.fromEntries(BUILDINGS.map((b) => [b.id, 0])),
      upgrades: new Set(),     // IDs gekaufter Upgrades
      achievements: new Set(), // IDs freigeschalteter Erfolge
      flags: { renamed: false, returned: false },
      buyAmount: 1,
      startedAt: now,
      lastSaved: now,
    };
  }

  /** Lädt den Spielstand aus localStorage – bei Fehlern gibt es ein frisches Spiel. */
  function loadState() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      return raw ? sanitizeState(JSON.parse(raw)) : createInitialState();
    } catch (error) {
      console.warn('Spielstand konnte nicht geladen werden:', error);
      return createInitialState();
    }
  }

  /** Übernimmt nur gültige Werte aus einem (evtl. alten oder manipulierten) Spielstand. */
  function sanitizeState(data) {
    const fresh = createInitialState();
    if (!data || typeof data !== 'object') return fresh;

    const num = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const idSet = (list, validIds) => new Set(Array.isArray(list) ? list.filter((id) => validIds.has(id)) : []);

    if (typeof data.bakeryName === 'string' && data.bakeryName.trim()) {
      fresh.bakeryName = data.bakeryName.trim().slice(0, 30);
    }
    for (const key of ['cookies', 'totalBaked', 'handmade', 'clicks', 'goldenClicks']) {
      fresh[key] = num(data[key]);
    }
    for (const b of BUILDINGS) {
      fresh.buildings[b.id] = Math.floor(num(data.buildings && data.buildings[b.id]));
    }
    fresh.upgrades = idSet(data.upgrades, UPGRADE_BY_ID);
    fresh.achievements = idSet(data.achievements, new Set(ACHIEVEMENTS.map((a) => a.id)));
    if (data.flags && typeof data.flags === 'object') {
      fresh.flags.renamed = data.flags.renamed === true;
      fresh.flags.returned = data.flags.returned === true;
    }
    fresh.buyAmount = CONFIG.BUY_AMOUNTS.includes(data.buyAmount) ? data.buyAmount : 1;
    fresh.startedAt = num(data.startedAt, fresh.startedAt) || fresh.startedAt;
    fresh.lastSaved = num(data.lastSaved, fresh.lastSaved) || fresh.lastSaved;
    return fresh;
  }

  function saveGame({ silent = false } = {}) {
    tickProduction(); // Kekse bis zu diesem Moment gutschreiben
    state.lastSaved = Date.now();
    try {
      const data = { ...state, upgrades: [...state.upgrades], achievements: [...state.achievements] };
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
      if (!silent) flashSaveIndicator();
    } catch (error) {
      console.warn('Spielstand konnte nicht gespeichert werden:', error);
    }
  }

  /** Setzt alles zurück – aufgerufen über den „Neues Spiel“-Dialog. */
  function resetGame() {
    state = createInitialState();
    Object.keys(buffs).forEach((key) => delete buffs[key]);
    removeGoldenCookie();
    scheduleGoldenCookie(true);
    seenUpgrades.clear();
    upgradeListKey = null;
    try {
      localStorage.removeItem(CONFIG.SAVE_KEY);
    } catch (error) {
      /* Speicher nicht verfügbar – nichts zu löschen */
    }
    recalculate();
    renderAll();
    rotateNews();
    saveGame({ silent: true });
    showToast({ icon: '🧑‍🍳', title: 'Neues Spiel', text: 'Frischer Teig, neues Glück!' });
  }

  /** Kekse, die die Gebäude produziert haben, während das Spiel geschlossen war. */
  function applyOfflineProgress() {
    const awaySeconds = (Date.now() - state.lastSaved) / 1000;
    if (awaySeconds < CONFIG.OFFLINE_MIN_SECONDS) return;
    if (awaySeconds >= 3600) state.flags.returned = true;

    const countedSeconds = Math.min(awaySeconds, CONFIG.OFFLINE_MAX_HOURS * 3600);
    const gain = mods.baseCps * countedSeconds * CONFIG.OFFLINE_EFFICIENCY;
    if (gain < 1) return;

    earn(gain);
    showToast({
      icon: '🌙',
      title: 'Willkommen zurück!',
      text: `Deine Bäcker haben in ${formatDuration(awaySeconds)} ${formatNumber(gain)} Kekse gebacken.`,
      duration: 7000,
    });
  }

  /* ======================================================================
     4. Berechnungen: Produktion, Klickwert, Preise
     Multiplikatoren ändern sich nur bei Käufen/Erfolgen – daher werden sie
     einmalig berechnet und zwischengespeichert statt in jedem Frame.
     ====================================================================== */

  const mods = {
    building: {},      // Multiplikator je Gebäudetyp
    global: 1,         // Multiplikator für die gesamte Produktion
    click: 1,          // Multiplikator für den Grund-Klickwert
    clickCpsShare: 0,  // Anteil der Kekse/Sek., den jeder Klick zusätzlich bringt
    goldenFreq: 1,
    goldenLength: 1,
    baseCps: 0,        // Kekse/Sek. ohne zeitlich begrenzte Boni
  };

  function recalculate() {
    BUILDINGS.forEach((b) => { mods.building[b.id] = 1; });
    mods.global = 1 + state.achievements.size * CONFIG.ACHIEVEMENT_BONUS;
    mods.click = 1;
    mods.clickCpsShare = 0;
    mods.goldenFreq = 1;
    mods.goldenLength = 1;

    for (const id of state.upgrades) {
      const effect = UPGRADE_BY_ID.get(id).effect;
      switch (effect.type) {
        case 'click': mods.click *= effect.mult; break;
        case 'clickCps': mods.clickCpsShare += effect.share; break;
        case 'building': mods.building[effect.building] *= effect.mult; break;
        case 'global': mods.global *= effect.mult; break;
        case 'goldenFreq': mods.goldenFreq *= effect.mult; break;
        case 'goldenLength': mods.goldenLength *= effect.mult; break;
        default: break;
      }
    }

    mods.baseCps = BUILDINGS.reduce((sum, b) => sum + getUnitCps(b) * state.buildings[b.id], 0);
  }

  /** Kekse/Sek. eines einzelnen Gebäudes inkl. aller Upgrades. */
  const getUnitCps = (building) => building.baseCps * mods.building[building.id] * mods.global;

  /** Multiplikator eines aktiven Bonus (1, wenn keiner aktiv ist). */
  const getBuffMult = (id) => (buffs[id] && buffs[id].end > Date.now() ? buffs[id].mult : 1);

  /** Aktuelle Kekse/Sek. inkl. Raserei-Bonus. */
  const getCps = () => mods.baseCps * getBuffMult('frenzy');

  /** Kekse pro Klick. */
  const getClickValue = () =>
    (CONFIG.BASE_CLICK * mods.click + getCps() * mods.clickCpsShare) * getBuffMult('clickFrenzy');

  /** Preis für `amount` Gebäude, wenn bereits `owned` Stück vorhanden sind (+15 % pro Stück). */
  function getBuildingCost(building, owned, amount = 1) {
    let total = 0;
    for (let i = 0; i < amount; i++) {
      total += Math.ceil(building.baseCost * CONFIG.PRICE_GROWTH ** (owned + i));
    }
    return total;
  }

  const countBuildings = () => BUILDINGS.reduce((sum, b) => sum + state.buildings[b.id], 0);

  /* ======================================================================
     5. Aktionen: klicken & kaufen
     ====================================================================== */

  function earn(amount) {
    state.cookies += amount;
    state.totalBaked += amount;
  }

  /**
   * Automatische Produktion für `seconds` Sekunden.
   * Ein Raserei-Bonus zählt nur für den Teil der Zeit, in dem er aktiv war –
   * wichtig, wenn der Tab länger im Hintergrund lag.
   */
  function produce(seconds) {
    if (mods.baseCps <= 0 || seconds <= 0) return;
    let effectiveSeconds = seconds;
    const frenzy = buffs.frenzy;
    if (frenzy) {
      const now = Date.now();
      const start = now - seconds * 1000;
      const overlap = Math.max(0, Math.min(now, frenzy.end) - Math.max(start, frenzy.start)) / 1000;
      effectiveSeconds += overlap * (frenzy.mult - 1);
    }
    earn(mods.baseCps * effectiveSeconds);
  }

  let lastProductionAt = performance.now();

  /** Schreibt die Produktion seit dem letzten Aufruf gut (auch wenn der Tab pausiert war). */
  function tickProduction() {
    const now = performance.now();
    produce((now - lastProductionAt) / 1000);
    lastProductionAt = now;
  }

  /** Ein Klick auf den großen Keks. x/y = Position innerhalb der Backstube. */
  function clickCookie(x, y) {
    const value = getClickValue();
    earn(value);
    state.handmade += value;
    state.clicks += 1;

    spawnFloatingText(`+${formatRate(value)}`, x, y, buffs.clickFrenzy ? 'gold' : '');
    spawnCrumbs(x, y);
    rain.spawn(1);
    animate(ui.cookieArt, [
      { transform: 'scale(1)' }, { transform: 'scale(.94) rotate(-2deg)' }, { transform: 'scale(1)' },
    ], { duration: 160, easing: 'ease-out' });
  }

  function buyBuilding(id) {
    const building = BUILDING_BY_ID.get(id);
    const view = ui.buildings.get(id);
    if (view.el.classList.contains('is-locked')) return;

    const cost = getBuildingCost(building, state.buildings[id], state.buyAmount);
    if (state.cookies < cost) {
      shake(view.el);
      return;
    }
    state.cookies -= cost;
    state.buildings[id] += state.buyAmount;
    recalculate();
    afterPurchase();
    pop(view.owned);
  }

  function buyUpgrade(id) {
    const upgrade = UPGRADE_BY_ID.get(id);
    if (state.upgrades.has(id)) return;
    if (state.cookies < upgrade.cost) {
      shake(ui.upgrades.get(id));
      return;
    }
    state.cookies -= upgrade.cost;
    state.upgrades.add(id);
    recalculate();
    afterPurchase();
    showToast({ icon: upgrade.emoji, title: 'Upgrade gekauft', text: upgrade.name, duration: 2500 });
  }

  function afterPurchase() {
    checkAchievements();
    updateShop();
    renderCounters();
  }

  /* ======================================================================
     6. Goldene Kekse & Boni
     Taucht zufällig in der Backstube auf. Anklicken löst einen Effekt aus:
     Glücksfall (Sofort-Kekse), Raserei (×7 Produktion) oder Klick-Rausch.
     ====================================================================== */

  const buffs = {}; // aktive Boni, z. B. { frenzy: { label, icon, mult, start, end, duration } }
  const golden = { el: null, nextAt: 0, despawnAt: 0 };

  function scheduleGoldenCookie(first = false) {
    const [min, max] = first ? CONFIG.GOLDEN_FIRST_DELAY_S : CONFIG.GOLDEN_DELAY_S;
    golden.nextAt = Date.now() + (rand(min, max) * 1000) / mods.goldenFreq;
  }

  function updateGoldenCookie(now) {
    if (golden.el) {
      if (now >= golden.despawnAt) {
        removeGoldenCookie(true);
        scheduleGoldenCookie();
      }
      return;
    }
    if (now < golden.nextAt) return;
    if (document.hidden) {
      scheduleGoldenCookie(); // Niemand schaut zu – später nochmal versuchen
      return;
    }
    spawnGoldenCookie(now);
  }

  function spawnGoldenCookie(now) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'golden-cookie';
    el.setAttribute('aria-label', 'Goldener Keks! Schnell anklicken');
    el.innerHTML = GOLDEN_COOKIE_SVG;
    el.style.left = `${rand(12, 88)}%`;
    el.style.top = `${rand(16, 84)}%`;
    el.addEventListener('click', onGoldenCookieClick, { once: true });
    ui.stage.append(el);

    golden.el = el;
    golden.despawnAt = now + CONFIG.GOLDEN_LIFETIME_S * 1000;
  }

  function removeGoldenCookie(fadeOut = false) {
    const el = golden.el;
    golden.el = null;
    if (!el) return;
    if (!fadeOut || prefersReducedMotion) {
      el.remove();
      return;
    }
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 600);
  }

  function onGoldenCookieClick(event) {
    const stageRect = ui.stage.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left - stageRect.left + rect.width / 2;
    const y = rect.top - stageRect.top + rect.height / 2;

    removeGoldenCookie();
    scheduleGoldenCookie();
    state.goldenClicks += 1;

    const effect = pickWeighted(GOLDEN_EFFECTS);
    if (effect.id === 'lucky') {
      // Bis zu 15 % des Kontostands, aber höchstens 15 Minuten Produktion
      const gain = Math.min(state.cookies * 0.15, mods.baseCps * 900) + 13;
      earn(gain);
      spawnFloatingText(`+${formatNumber(gain)}`, x, y, 'gold');
      showToast({ icon: effect.icon, title: effect.title, text: `+${formatNumber(gain)} Kekse!`, variant: 'gold' });
    } else {
      const now = Date.now();
      const duration = effect.duration * mods.goldenLength;
      buffs[effect.id] = {
        label: effect.label, icon: effect.icon, mult: effect.mult,
        start: now, end: now + duration * 1000, duration,
      };
      spawnFloatingText(`${effect.title}`, x, y, 'gold');
      showToast({
        icon: effect.icon, title: effect.title,
        text: `${effect.target} ×${effect.mult} für ${Math.round(duration)} Sekunden!`, variant: 'gold',
      });
    }

    spawnCrumbs(x, y, 16, '#ffd54a');
    checkAchievements();
    updateBuffs(Date.now());
  }

  /** Entfernt abgelaufene Boni. */
  function expireBuffs(now) {
    for (const id of Object.keys(buffs)) {
      if (buffs[id].end <= now) delete buffs[id];
    }
  }

  /* ======================================================================
     7. Erfolge
     ====================================================================== */

  function checkAchievements() {
    const info = { cps: mods.baseCps, buildings: countBuildings() };
    const unlocked = ACHIEVEMENTS.filter((a) => !state.achievements.has(a.id) && a.check(state, info));
    if (!unlocked.length) return;

    unlocked.forEach((a) => state.achievements.add(a.id));
    recalculate(); // Erfolge erhöhen die Produktion

    // Mehrere gleichzeitig freigeschaltete Erfolge landen in einem Toast statt in einer Flut
    const note = `+${Math.round(unlocked.length * CONFIG.ACHIEVEMENT_BONUS * 100)} % Produktion`;
    const [first] = unlocked;
    showToast(unlocked.length === 1
      ? { icon: first.emoji, title: 'Erfolg freigeschaltet', text: first.name, note, variant: 'achievement' }
      : {
        icon: '🏆',
        title: `${unlocked.length} Erfolge freigeschaltet`,
        text: unlocked.map((a) => a.name).join(', '),
        note,
        variant: 'achievement',
      });
  }

  /* ======================================================================
     8. Oberfläche: Zähler, Shop, Boni, News, Toasts
     ====================================================================== */

  const ui = { buildings: new Map(), upgrades: new Map() };
  const seenUpgrades = new Set(); // bereits angezeigte Upgrades (für die „Neu“-Hervorhebung)
  let upgradeListKey = null;      // aktuell gerenderte Upgrade-Liste
  let lastNews = '';

  function cacheDom() {
    Object.assign(ui, {
      cookieCount: $('#cookieCount'),
      cpsCount: $('#cpsCount'),
      bakeryName: $('#bakeryName'),
      bakeryNameText: $('#bakeryNameText'),
      news: $('#newsText'),
      stage: $('#stage'),
      bigCookie: $('#bigCookie'),
      fxLayer: $('#fxLayer'),
      buffs: $('#buffs'),
      perClick: $('#perClick'),
      rainCanvas: $('#rainCanvas'),
      buyAmount: $('#buyAmount'),
      upgradeList: $('#upgradeList'),
      upgradeCount: $('#upgradeCount'),
      buildingList: $('#buildingList'),
      toasts: $('#toasts'),
      saveIndicator: $('#saveIndicator'),
      statsBtn: $('#statsBtn'),
      newGameBtn: $('#newGameBtn'),
      confirmDialog: $('#confirmDialog'),
      renameDialog: $('#renameDialog'),
      renameInput: $('#renameInput'),
      statsDialog: $('#statsDialog'),
      statsGrid: $('#statsGrid'),
      achievementList: $('#achievementList'),
      achievementCount: $('#achievementCount'),
    });
  }

  /** Zeichnet alles neu – nach dem Laden oder einem Neustart. */
  function renderAll() {
    setText(ui.bakeryNameText, state.bakeryName);
    for (const button of ui.buyAmount.querySelectorAll('button')) {
      const active = Number(button.dataset.amount) === state.buyAmount;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    updateShop();
    updateBuffs(Date.now());
    renderCounters();
  }

  /** Header-Zähler – läuft in jedem Frame, damit der Zähler flüssig hochzählt. */
  function renderCounters() {
    setText(ui.cookieCount, formatNumber(state.cookies));
    setText(ui.cpsCount, formatRate(getCps()));
  }

  /** Seltener aktualisierte Anzeigen (4× pro Sekunde reicht völlig). */
  function renderSlowUi() {
    setText(ui.perClick, `+${formatRate(getClickValue())} pro Klick`);
    const title = `${formatNumber(state.cookies)} Kekse · Cookie Clicker Light`;
    if (document.title !== title) document.title = title;
  }

  /* --- Shop: Gebäude ---------------------------------------------------- */

  /** Legt die Gebäude-Buttons einmalig an – danach werden nur noch Werte aktualisiert. */
  function buildBuildingList() {
    for (const building of BUILDINGS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'building';
      el.innerHTML = `
        <span class="building__icon" aria-hidden="true"></span>
        <span class="building__info">
          <span class="building__name"></span>
          <span class="building__cost"><span aria-hidden="true">🍪</span><span class="building__price"></span></span>
          <span class="building__meta"></span>
        </span>
        <span class="building__owned" aria-hidden="true"></span>`;
      el.querySelector('.building__icon').textContent = building.emoji;
      el.addEventListener('click', () => buyBuilding(building.id));
      ui.buildingList.append(el);
      ui.buildings.set(building.id, {
        el,
        name: el.querySelector('.building__name'),
        price: el.querySelector('.building__price'),
        meta: el.querySelector('.building__meta'),
        owned: el.querySelector('.building__owned'),
      });
    }
  }

  function updateBuildings() {
    let previews = 0;

    BUILDINGS.forEach((building, index) => {
      const view = ui.buildings.get(building.id);
      const owned = state.buildings[building.id];
      const unlocked = index === 0 || owned > 0 || state.totalBaked >= building.baseCost * CONFIG.REVEAL_RATIO;
      // Die nächsten noch unbekannten Gebäude werden als „???“ angeteasert, der Rest bleibt verborgen.
      const locked = !unlocked && previews++ < CONFIG.LOCKED_PREVIEW;
      view.el.hidden = !unlocked && !locked;
      if (view.el.hidden) return;

      const cost = getBuildingCost(building, owned, state.buyAmount);
      const affordable = unlocked && state.cookies >= cost;
      const unitCps = getUnitCps(building);
      const name = unlocked ? building.name : '???';
      const price = formatNumber(cost);

      setText(view.name, name);
      setText(view.price, state.buyAmount > 1 && unlocked ? `${price} (×${state.buyAmount})` : price);
      setText(view.owned, owned > 0 ? String(owned) : '');
      setText(view.meta, !unlocked ? ''
        : `+${formatRate(unitCps)}/s je Stück${owned ? ` · ${formatRate(unitCps * owned)}/s gesamt` : ''}`);

      view.el.classList.toggle('is-locked', !unlocked);
      view.el.classList.toggle('is-affordable', affordable);
      view.el.classList.toggle('is-expensive', unlocked && !affordable);
      view.el.setAttribute('aria-disabled', String(!affordable));
      const tooltip = unlocked ? building.desc : 'Noch unentdeckt – backe weiter!';
      if (view.el.title !== tooltip) view.el.title = tooltip;
      const label = unlocked
        ? `${building.name} kaufen (×${state.buyAmount}) für ${price} Kekse. Im Besitz: ${owned}`
        : 'Unbekanntes Gebäude';
      if (view.el.getAttribute('aria-label') !== label) view.el.setAttribute('aria-label', label);
    });
  }

  /* --- Shop: Upgrades --------------------------------------------------- */

  function updateUpgrades() {
    const available = UPGRADES
      .filter((u) => !state.upgrades.has(u.id) && u.unlock(state))
      .sort((a, b) => a.cost - b.cost);

    // Liste nur neu aufbauen, wenn sich die verfügbaren Upgrades geändert haben
    const key = available.map((u) => u.id).join('|');
    if (key !== upgradeListKey) {
      renderUpgradeList(available, upgradeListKey !== null);
      upgradeListKey = key;
    }

    for (const upgrade of available) {
      const el = ui.upgrades.get(upgrade.id);
      const affordable = state.cookies >= upgrade.cost;
      el.classList.toggle('is-affordable', affordable);
      el.classList.toggle('is-expensive', !affordable);
      el.setAttribute('aria-disabled', String(!affordable));
    }
  }

  function renderUpgradeList(available, highlightNew) {
    ui.upgradeList.textContent = '';
    ui.upgrades.clear();
    setText(ui.upgradeCount, available.length ? String(available.length) : '');

    if (!available.length) {
      const hint = document.createElement('p');
      hint.className = 'empty-hint';
      hint.textContent = 'Noch keine Upgrades verfügbar – backe weiter!';
      ui.upgradeList.append(hint);
      return;
    }

    for (const upgrade of available) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'upgrade';
      el.innerHTML = `
        <span class="upgrade__icon" aria-hidden="true"></span>
        <span class="upgrade__info">
          <span class="upgrade__name"></span>
          <span class="upgrade__desc"></span>
        </span>
        <span class="upgrade__cost"><span aria-hidden="true">🍪</span> <span class="upgrade__price"></span></span>`;
      const icon = el.querySelector('.upgrade__icon');
      icon.textContent = upgrade.emoji;
      if (upgrade.badge) icon.dataset.badge = upgrade.badge;
      el.querySelector('.upgrade__name').textContent = upgrade.name;
      el.querySelector('.upgrade__desc').textContent = upgrade.desc;
      el.querySelector('.upgrade__price').textContent = formatNumber(upgrade.cost);
      el.setAttribute('aria-label', `${upgrade.name}: ${upgrade.desc} Preis: ${formatNumber(upgrade.cost)} Kekse`);
      if (highlightNew && !seenUpgrades.has(upgrade.id)) el.classList.add('is-new');
      seenUpgrades.add(upgrade.id);

      el.addEventListener('click', () => buyUpgrade(upgrade.id));
      ui.upgradeList.append(el);
      ui.upgrades.set(upgrade.id, el);
    }
  }

  function updateShop() {
    updateUpgrades();
    updateBuildings();
  }

  function setBuyAmount(amount) {
    state.buyAmount = amount;
    renderAll();
  }

  /* --- Aktive Boni ------------------------------------------------------ */

  function updateBuffs(now) {
    const ids = Object.keys(buffs);
    const key = ids.join('|');
    if (ui.buffs.dataset.key !== key) {
      ui.buffs.dataset.key = key;
      ui.buffs.textContent = '';
      for (const id of ids) {
        const chip = document.createElement('div');
        chip.className = 'buff';
        chip.dataset.id = id;
        chip.innerHTML = '<span class="buff__label"></span><span class="buff__bar"></span>';
        ui.buffs.append(chip);
      }
    }

    for (const chip of ui.buffs.children) {
      const buff = buffs[chip.dataset.id];
      const remaining = Math.max(0, (buff.end - now) / 1000);
      setText(chip.firstElementChild, `${buff.icon} ${buff.label} ×${buff.mult} · ${Math.ceil(remaining)}s`);
      chip.lastElementChild.style.width = `${(remaining / buff.duration) * 100}%`;
    }

    ui.stage.classList.toggle('is-frenzy', Boolean(buffs.frenzy));
    ui.stage.classList.toggle('is-click-frenzy', Boolean(buffs.clickFrenzy));
    ui.cpsCount.classList.toggle('is-boosted', Boolean(buffs.frenzy));
  }

  /* --- News-Ticker ------------------------------------------------------ */

  function rotateNews() {
    const pool = NEWS.filter((n) => n.when(state)).map((n) => n.text);
    if (!pool.length) return;
    const candidates = pool.length > 1 ? pool.filter((text) => text !== lastNews) : pool;
    const text = candidates[Math.floor(Math.random() * candidates.length)];
    if (text === lastNews) return;
    lastNews = text;

    if (prefersReducedMotion || !ui.news.textContent) {
      ui.news.textContent = text;
      return;
    }
    ui.news.classList.add('is-changing');
    setTimeout(() => {
      ui.news.textContent = text;
      ui.news.classList.remove('is-changing');
    }, 350);
  }

  /* --- Toasts (kleine Benachrichtigungen) -------------------------------- */

  const MAX_TOASTS = 3;

  function showToast({ icon = '🍪', title, text = '', note = '', variant = '', duration = 4500 }) {
    while (ui.toasts.children.length >= MAX_TOASTS) ui.toasts.firstElementChild.remove();

    const el = document.createElement('div');
    el.className = `toast${variant ? ` toast--${variant}` : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <span class="toast__icon" aria-hidden="true"></span>
      <span class="toast__body">
        <span class="toast__title"></span>
        <span class="toast__text"></span>
        <span class="toast__note"></span>
      </span>
      <button type="button" class="toast__close" aria-label="Benachrichtigung schließen">✕</button>`;
    el.querySelector('.toast__icon').textContent = icon;
    el.querySelector('.toast__title').textContent = title;
    el.querySelector('.toast__text').textContent = text;
    el.querySelector('.toast__note').textContent = note;

    const close = () => {
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    };
    el.querySelector('.toast__close').addEventListener('click', close);
    setTimeout(close, duration);
    ui.toasts.append(el);
  }

  let saveIndicatorTimer = 0;
  function flashSaveIndicator() {
    ui.saveIndicator.classList.add('is-visible');
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(() => ui.saveIndicator.classList.remove('is-visible'), 1500);
  }

  /* ======================================================================
     9. Dialoge: Neues Spiel, Umbenennen, Statistik
     Nutzt das native <dialog>-Element (mit Fallback für sehr alte Browser).
     ====================================================================== */

  const canUseDialogs = typeof HTMLDialogElement === 'function'
    && typeof HTMLDialogElement.prototype.showModal === 'function';

  function openDialog(dialog) {
    dialog.returnValue = ''; // sonst würde „Esc“ den Wert vom letzten Mal übernehmen
    dialog.showModal();
  }

  function askNewGame() {
    if (canUseDialogs) openDialog(ui.confirmDialog);
    else if (window.confirm('Neues Spiel starten? Dein gesamter Fortschritt geht verloren.')) resetGame();
  }

  function askRename() {
    if (!canUseDialogs) {
      const name = window.prompt('Wie soll deine Bäckerei heißen?', state.bakeryName);
      if (name !== null) renameBakery(name);
      return;
    }
    ui.renameInput.value = state.bakeryName;
    openDialog(ui.renameDialog);
    ui.renameInput.select();
  }

  function renameBakery(rawName) {
    const name = rawName.trim().slice(0, 30) || DEFAULT_BAKERY_NAME;
    if (name === state.bakeryName) return;
    state.bakeryName = name;
    if (name !== DEFAULT_BAKERY_NAME) state.flags.renamed = true;
    setText(ui.bakeryNameText, name);
    checkAchievements();
    saveGame({ silent: true });
  }

  /* --- Statistik -------------------------------------------------------- */

  const STATS = [
    ['Kekse im Lager', () => formatNumber(state.cookies)],
    ['Insgesamt gebacken', () => formatNumber(state.totalBaked)],
    ['Kekse pro Sekunde', () => formatRate(getCps())],
    ['Kekse pro Klick', () => formatRate(getClickValue())],
    ['Keks-Klicks', () => formatNumber(state.clicks)],
    ['Handgebackene Kekse', () => formatNumber(state.handmade)],
    ['Goldene Kekse', () => formatNumber(state.goldenClicks)],
    ['Gebäude', () => formatNumber(countBuildings())],
    ['Upgrades', () => `${state.upgrades.size} / ${UPGRADES.length}`],
    ['Erfolgs-Bonus', () => `+${Math.round(state.achievements.size * CONFIG.ACHIEVEMENT_BONUS * 100)} % Produktion`],
    ['Spielzeit', () => formatDuration((Date.now() - state.startedAt) / 1000)],
  ];
  const statValueEls = [];
  let renderedAchievementCount = -1;

  function buildStatsGrid() {
    for (const [label] of STATS) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      ui.statsGrid.append(dt, dd);
      statValueEls.push(dd);
    }
  }

  function openStats() {
    renderedAchievementCount = -1;
    renderStats();
    if (canUseDialogs) openDialog(ui.statsDialog);
  }

  function renderStats() {
    STATS.forEach(([, getValue], i) => setText(statValueEls[i], getValue()));
    if (renderedAchievementCount === state.achievements.size) return;
    renderedAchievementCount = state.achievements.size;

    ui.achievementList.textContent = '';
    for (const achievement of ACHIEVEMENTS) {
      const unlocked = state.achievements.has(achievement.id);
      const item = document.createElement('div');
      item.className = `achievement${unlocked ? '' : ' is-locked'}`;
      item.innerHTML = `
        <span class="achievement__icon" aria-hidden="true"></span>
        <span class="achievement__text"><strong></strong><small></small></span>`;
      item.querySelector('.achievement__icon').textContent = unlocked ? achievement.emoji : '🔒';
      item.querySelector('strong').textContent = unlocked ? achievement.name : '???';
      item.querySelector('small').textContent = achievement.desc;
      ui.achievementList.append(item);
    }
    setText(ui.achievementCount, `${state.achievements.size} / ${ACHIEVEMENTS.length}`);
  }

  /* ======================================================================
     10. Effekte: Schwebetext, Krümel, Keksregen
     ====================================================================== */

  const MAX_FX_ELEMENTS = 120; // Obergrenze, damit Dauerklicken das DOM nicht flutet

  /** Position relativ zur Backstube (für Effekte). */
  function toStagePoint(clientX, clientY) {
    const rect = ui.stage.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** Zufälliger Punkt auf dem großen Keks – für Klicks per Tastatur. */
  function randomPointOnCookie() {
    const rect = ui.bigCookie.getBoundingClientRect();
    return toStagePoint(
      rect.left + rect.width * rand(0.3, 0.7),
      rect.top + rect.height * rand(0.3, 0.7),
    );
  }

  function spawnFloatingText(text, x, y, variant = '') {
    if (ui.fxLayer.childElementCount >= MAX_FX_ELEMENTS) ui.fxLayer.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = `float-text${variant ? ` float-text--${variant}` : ''}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--drift', `${rand(-26, 26).toFixed(0)}px`);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    ui.fxLayer.append(el);
  }

  function spawnCrumbs(x, y, count = 5, color = '') {
    if (prefersReducedMotion) return;
    for (let i = 0; i < count && ui.fxLayer.childElementCount < MAX_FX_ELEMENTS; i++) {
      const angle = rand(0, Math.PI * 2);
      const distance = rand(30, 85);
      const el = document.createElement('span');
      el.className = 'crumb';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--dx', `${(Math.cos(angle) * distance).toFixed(0)}px`);
      el.style.setProperty('--dy', `${(Math.sin(angle) * distance + 35).toFixed(0)}px`); // leicht nach unten (Schwerkraft)
      el.style.setProperty('--rot', `${rand(-360, 360).toFixed(0)}deg`);
      el.style.setProperty('--size', `${rand(4, 9).toFixed(1)}px`);
      if (color) el.style.background = color;
      el.addEventListener('animationend', () => el.remove(), { once: true });
      ui.fxLayer.append(el);
    }
  }

  /**
   * Keksregen im Hintergrund (Canvas): Je mehr Kekse pro Sekunde,
   * desto mehr Kekse fallen. Jeder Klick lässt zusätzlich einen fallen.
   */
  const rain = {
    MAX_DROPS: 140,
    drops: [],
    spawnBudget: 0,
    width: 0,
    height: 0,
    dpr: 1,
    ctx: null,
    sprite: null,

    init(canvas) {
      if (prefersReducedMotion) return;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.sprite = new Image();
      this.sprite.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createCookieSVG('classic', 'rain'))}`;
      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      else window.addEventListener('resize', () => this.resize());
    },

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = Math.round(rect.width * this.dpr);
      this.canvas.height = Math.round(rect.height * this.dpr);
    },

    spawn(count) {
      if (!this.ctx) return;
      for (let i = 0; i < count && this.drops.length < this.MAX_DROPS; i++) {
        const size = rand(16, 34);
        this.drops.push({
          x: rand(0, this.width),
          y: -size,
          size,
          speed: rand(60, 130),
          angle: rand(0, Math.PI * 2),
          spin: rand(-1.8, 1.8),
        });
      }
    },

    update(dt, cps) {
      if (!this.ctx) return;
      // Hintergrund-Regen wächst logarithmisch mit der Produktion (max. ~10 Kekse/Sek.)
      this.spawnBudget += Math.min(10, Math.log10(cps + 1) * 2.2) * dt;
      const whole = Math.floor(this.spawnBudget);
      if (whole > 0) {
        this.spawnBudget -= whole;
        this.spawn(whole);
      }
      for (const drop of this.drops) {
        drop.y += drop.speed * dt;
        drop.angle += drop.spin * dt;
      }
      this.drops = this.drops.filter((drop) => drop.y < this.height + drop.size);
      this.draw();
    },

    draw() {
      const { ctx, dpr } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // naturalWidth = 0 → Bild (noch) nicht nutzbar; drawImage würde sonst eine Exception werfen
      if (!this.sprite.naturalWidth || !this.drops.length) return;
      for (const drop of this.drops) {
        const cos = Math.cos(drop.angle) * dpr;
        const sin = Math.sin(drop.angle) * dpr;
        ctx.setTransform(cos, sin, -sin, cos, drop.x * dpr, drop.y * dpr);
        ctx.globalAlpha = Math.max(0, 1 - drop.y / this.height) * 0.55; // nach unten ausblenden
        ctx.drawImage(this.sprite, -drop.size / 2, -drop.size / 2, drop.size, drop.size);
      }
      ctx.globalAlpha = 1;
    },
  };

  /* ======================================================================
     11. Spielschleife & Start
     ====================================================================== */

  let lastFrame = performance.now();
  let slowTimer = 0;

  /** Läuft ~60× pro Sekunde: Produktion, Zähler und Keksregen. */
  function frame(now) {
    requestAnimationFrame(frame); // zuerst planen – ein Fehler unten stoppt so nicht das ganze Spiel
    const dt = Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;

    tickProduction();
    renderCounters();
    rain.update(Math.min(dt, 0.1), getCps());

    slowTimer += dt;
    if (slowTimer >= 0.25) {
      slowTimer = 0;
      slowTick();
    }
  }

  /** Läuft 4× pro Sekunde: alles, was nicht jeden Frame aktualisiert werden muss. */
  function slowTick() {
    const now = Date.now();
    expireBuffs(now);
    updateGoldenCookie(now);
    checkAchievements();
    updateShop();
    updateBuffs(now);
    renderSlowUi();
    if (ui.statsDialog.open) renderStats();
  }

  function bindEvents() {
    // Großer Keks: pointerdown reagiert sofort (auch Multi-Touch) ohne Klick-Verzögerung
    ui.bigCookie.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      ui.bigCookie.classList.add('is-pressed');
      const { x, y } = toStagePoint(event.clientX, event.clientY);
      clickCookie(x, y);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      ui.bigCookie.addEventListener(type, () => ui.bigCookie.classList.remove('is-pressed'));
    }
    // Tastatur & Screenreader lösen ein „click“ ohne Zeiger aus (detail === 0)
    ui.bigCookie.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      const { x, y } = randomPointOnCookie();
      clickCookie(x, y);
    });
    // Gedrückt gehaltene Enter-Taste soll kein Auto-Klicker sein
    ui.bigCookie.addEventListener('keydown', (event) => {
      if (event.repeat) event.preventDefault();
    });
    // Kein Kontextmenü bei langem Drücken auf dem Handy
    ui.stage.addEventListener('contextmenu', (event) => event.preventDefault());

    ui.buyAmount.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-amount]');
      if (button) setBuyAmount(Number(button.dataset.amount));
    });

    ui.bakeryName.addEventListener('click', askRename);
    ui.newGameBtn.addEventListener('click', askNewGame);
    ui.statsBtn.addEventListener('click', openStats);

    // Dialoge
    ui.confirmDialog.addEventListener('close', () => {
      if (ui.confirmDialog.returnValue === 'confirm') resetGame();
    });
    ui.renameDialog.addEventListener('close', () => {
      if (ui.renameDialog.returnValue === 'save') renameBakery(ui.renameInput.value);
    });
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) dialog.close();
        else if (event.target === dialog) dialog.close(); // Klick auf den abgedunkelten Hintergrund
      });
    }

    // Speichern, wenn der Tab verlassen oder geschlossen wird
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveGame({ silent: true });
    });
    window.addEventListener('pagehide', () => saveGame({ silent: true }));
  }

  function init() {
    cacheDom();
    ui.bigCookie.innerHTML = createCookieSVG('classic', 'big');
    ui.cookieArt = ui.bigCookie.firstElementChild;
    buildBuildingList();
    buildStatsGrid();
    bindEvents();

    state = loadState();
    recalculate();
    applyOfflineProgress();
    scheduleGoldenCookie(true);
    checkAchievements();
    renderAll();
    renderSlowUi();
    rain.init(ui.rainCanvas);

    rotateNews();
    setInterval(rotateNews, CONFIG.NEWS_INTERVAL_MS);
    setInterval(() => saveGame(), CONFIG.AUTOSAVE_INTERVAL_MS);

    lastProductionAt = performance.now();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  init();
})();
