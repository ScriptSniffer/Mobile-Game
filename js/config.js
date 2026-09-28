/* ==========================================================================
   Cookie Clicker Light – Spieldaten & Balancing
   --------------------------------------------------------------------------
   Hier stehen alle Inhalte des Spiels: Gebäude, Upgrades, Erfolge, goldene
   Kekse und News-Meldungen. Die Spiellogik (game.js) liest nur diese Daten –
   wer das Balancing ändern oder neue Inhalte hinzufügen möchte, muss nur
   diese Datei anpassen.

   Wichtig: Die `id`-Felder werden im Spielstand gespeichert. Bestehende IDs
   daher nicht umbenennen, sonst gehen gespeicherte Käufe/Erfolge verloren.
   ========================================================================== */
'use strict';

/** Allgemeine Spieleinstellungen */
const CONFIG = Object.freeze({
  SAVE_KEY: 'cookie-clicker-light:save',
  SAVE_VERSION: 1,
  AUTOSAVE_INTERVAL_MS: 10000,

  BASE_CLICK: 1,              // Kekse pro Klick ohne Upgrades
  PRICE_GROWTH: 1.15,         // Jedes weitere Gebäude derselben Sorte kostet 15 % mehr
  BUY_AMOUNTS: [1, 10, 100],  // Wählbare Kaufmengen im Shop
  REVEAL_RATIO: 0.5,          // Gebäude wird sichtbar, sobald 50 % seines Preises gebacken wurden
  LOCKED_PREVIEW: 2,          // So viele „???“-Gebäude werden als Vorschau angezeigt
  ACHIEVEMENT_BONUS: 0.01,    // Jeder Erfolg gibt +1 % Produktion

  OFFLINE_EFFICIENCY: 0.5,    // Anteil der Produktion, während das Spiel geschlossen ist
  OFFLINE_MAX_HOURS: 24,      // Maximal angerechnete Abwesenheit
  OFFLINE_MIN_SECONDS: 30,    // Kürzere Pausen werden ignoriert

  NEWS_INTERVAL_MS: 9000,     // Wie oft der News-Ticker wechselt

  GOLDEN_FIRST_DELAY_S: [40, 90], // Erster goldener Keks nach dem Laden (min, max)
  GOLDEN_DELAY_S: [60, 180],      // Abstand zwischen goldenen Keksen (min, max)
  GOLDEN_LIFETIME_S: 13,          // So lange bleibt ein goldener Keks anklickbar
});

/* --------------------------------------------------------------------------
   Gebäude
   baseCost = Preis des ersten Exemplars, baseCps = Kekse pro Sekunde je Stück
   -------------------------------------------------------------------------- */
const BUILDINGS = [
  {
    id: 'cursor', name: 'Cursor', plural: 'Cursor', emoji: '👆',
    baseCost: 10, baseCps: 0.1,
    desc: 'Klickt automatisch alle 10 Sekunden für dich.',
    firstAchievement: { name: 'Klick-Assistent', desc: 'Kaufe deinen ersten Cursor.' },
  },
  {
    id: 'grandma', name: 'Oma', plural: 'Omas', emoji: '👵',
    baseCost: 100, baseCps: 1,
    desc: 'Eine liebe Oma, die mit ganz viel Liebe Kekse backt.',
    firstAchievement: { name: 'Omas Liebling', desc: 'Stelle deine erste Oma ein.' },
  },
  {
    id: 'farm', name: 'Farm', plural: 'Farmen', emoji: '🌾',
    baseCost: 1000, baseCps: 8,
    desc: 'Züchtet Keks-Pflanzen aus erstklassigen Keks-Samen.',
    firstAchievement: { name: 'Bauer sucht Keks', desc: 'Kaufe deine erste Farm.' },
  },
  {
    id: 'bank', name: 'Bank', plural: 'Banken', emoji: '🏦',
    baseCost: 10000, baseCps: 47,
    desc: 'Erwirtschaftet Kekse aus Zinsen und Zinseszinsen.',
    firstAchievement: { name: 'Keks-Kapitalist', desc: 'Eröffne deine erste Bank.' },
  },
  {
    id: 'wizard', name: 'Zauberturm', plural: 'Zaubertürme', emoji: '🧙',
    baseCost: 100000, baseCps: 260,
    desc: 'Beschwört frische Kekse mit uralter Magie herbei.',
    firstAchievement: { name: 'Abrakadabra', desc: 'Errichte deinen ersten Zauberturm.' },
  },
  {
    id: 'portal', name: 'Portal', plural: 'Portale', emoji: '🌀',
    baseCost: 1000000, baseCps: 1400,
    desc: 'Öffnet ein Tor ins Keksversum. Was soll schon schiefgehen?',
    firstAchievement: { name: 'Durch das Portal', desc: 'Öffne dein erstes Portal.' },
  },
  {
    id: 'timemachine', name: 'Zeitmaschine', plural: 'Zeitmaschinen', emoji: '⏳',
    baseCost: 10000000, baseCps: 7800,
    desc: 'Holt Kekse aus der Vergangenheit, bevor sie gegessen wurden.',
    firstAchievement: { name: 'Zeitreisender', desc: 'Baue deine erste Zeitmaschine.' },
  },
  {
    id: 'antimatter', name: 'Antimaterie-Kondensator', plural: 'Antimaterie-Kondensatoren', emoji: '⚛️',
    baseCost: 100000000, baseCps: 44000,
    desc: 'Verwandelt Antimaterie in Kekse. Bitte nicht die Physik fragen.',
    firstAchievement: { name: 'Urknall im Ofen', desc: 'Baue deinen ersten Antimaterie-Kondensator.' },
  },
  {
    id: 'prism', name: 'Prisma', plural: 'Prismen', emoji: '🌈',
    baseCost: 1000000000, baseCps: 260000,
    desc: 'Bricht reines Licht in köstliche Kekse auf.',
    firstAchievement: { name: 'Regenbogen-Rezept', desc: 'Baue dein erstes Prisma.' },
  },
];

/* --------------------------------------------------------------------------
   Upgrades
   effect.type:
     click        – Klickwert ×mult
     clickCps     – Jeder Klick bringt zusätzlich `share` × Kekse/Sek.
     building     – Produktion eines Gebäudetyps ×mult
     global       – Gesamte Produktion ×mult
     goldenFreq   – Goldene Kekse erscheinen `mult`-mal so oft
     goldenLength – Effekte goldener Kekse halten `mult`-mal so lange
   unlock(state) entscheidet, ab wann ein Upgrade im Shop erscheint.
   -------------------------------------------------------------------------- */

/** Stufen der Gebäude-Upgrades: ab `require` Stück, Preis = Grundpreis × costFactor */
const TIER_LEVELS = [
  { suffix: 'Feinschliff',   badge: 'I',   require: 1,   costFactor: 10 },
  { suffix: 'Turbo',         badge: 'II',  require: 5,   costFactor: 50 },
  { suffix: 'Meisterklasse', badge: 'III', require: 25,  costFactor: 500 },
  { suffix: 'Legendär',      badge: 'IV',  require: 50,  costFactor: 50000 },
  { suffix: 'Göttlich',      badge: 'V',   require: 100, costFactor: 5000000 },
];

const UPGRADES = [
  // --- Klick-Upgrades -----------------------------------------------------
  {
    id: 'click-1', name: 'Verstärkter Zeigefinger', emoji: '💪', cost: 100,
    desc: 'Klicks bringen doppelt so viele Kekse.',
    effect: { type: 'click', mult: 2 },
    unlock: (s) => s.clicks >= 10,
  },
  {
    id: 'click-2', name: 'Beidhändiges Klicken', emoji: '🙌', cost: 500,
    desc: 'Klicks bringen doppelt so viele Kekse.',
    effect: { type: 'click', mult: 2 },
    unlock: (s) => s.clicks >= 100,
  },
  {
    id: 'click-3', name: 'Titan-Fingerknöchel', emoji: '🦾', cost: 10000,
    desc: 'Klicks bringen doppelt so viele Kekse.',
    effect: { type: 'click', mult: 2 },
    unlock: (s) => s.clicks >= 500,
  },
  {
    id: 'mouse-1', name: 'Plastikmaus', emoji: '🖱️', cost: 50000,
    desc: 'Jeder Klick bringt zusätzlich 1 % deiner Kekse/Sek.',
    effect: { type: 'clickCps', share: 0.01 },
    unlock: (s) => s.handmade >= 1000,
  },
  {
    id: 'mouse-2', name: 'Eisenmaus', emoji: '🖲️', cost: 5000000,
    desc: 'Jeder Klick bringt zusätzlich 1 % deiner Kekse/Sek.',
    effect: { type: 'clickCps', share: 0.01 },
    unlock: (s) => s.handmade >= 100000,
  },
  {
    id: 'mouse-3', name: 'Titanmaus', emoji: '🔩', cost: 500000000,
    desc: 'Jeder Klick bringt zusätzlich 1 % deiner Kekse/Sek.',
    effect: { type: 'clickCps', share: 0.01 },
    unlock: (s) => s.handmade >= 10000000,
  },
  {
    id: 'mouse-4', name: 'Adamantium-Maus', emoji: '💎', cost: 50000000000,
    desc: 'Jeder Klick bringt zusätzlich 1 % deiner Kekse/Sek.',
    effect: { type: 'clickCps', share: 0.01 },
    unlock: (s) => s.handmade >= 1000000000,
  },

  // --- Rezept-Upgrades (globale Produktion) -------------------------------
  {
    id: 'recipe-1', name: 'Schoko-Stückchen', emoji: '🍫', cost: 99999,
    desc: 'Gesamte Keks-Produktion +10 %.',
    effect: { type: 'global', mult: 1.1 },
    unlock: (s) => s.totalBaked >= 50000,
  },
  {
    id: 'recipe-2', name: 'Macadamia-Kekse', emoji: '🥜', cost: 9999999,
    desc: 'Gesamte Keks-Produktion +10 %.',
    effect: { type: 'global', mult: 1.1 },
    unlock: (s) => s.totalBaked >= 5000000,
  },
  {
    id: 'recipe-3', name: 'Doppelschoko-Kekse', emoji: '🍪', cost: 999999999,
    desc: 'Gesamte Keks-Produktion +15 %.',
    effect: { type: 'global', mult: 1.15 },
    unlock: (s) => s.totalBaked >= 500000000,
  },
  {
    id: 'recipe-4', name: 'Omas Geheimrezept', emoji: '📜', cost: 99999999999,
    desc: 'Gesamte Keks-Produktion +20 %.',
    effect: { type: 'global', mult: 1.2 },
    unlock: (s) => s.totalBaked >= 50000000000,
  },

  // --- Goldene-Keks-Upgrades ----------------------------------------------
  {
    id: 'golden-1', name: 'Glückstag', emoji: '🍀', cost: 777777,
    desc: 'Goldene Kekse erscheinen doppelt so oft.',
    effect: { type: 'goldenFreq', mult: 2 },
    unlock: (s) => s.goldenClicks >= 7,
  },
  {
    id: 'golden-2', name: 'Goldene Uhr', emoji: '⌚', cost: 77777777,
    desc: 'Effekte goldener Kekse halten doppelt so lange.',
    effect: { type: 'goldenLength', mult: 2 },
    unlock: (s) => s.goldenClicks >= 27,
  },

  // --- Gebäude-Upgrades (automatisch für jedes Gebäude erzeugt) -----------
  ...BUILDINGS.flatMap((building) =>
    TIER_LEVELS.map((tier, index) => ({
      id: `${building.id}-${index + 1}`,
      name: `${building.name}: ${tier.suffix}`,
      emoji: building.emoji,
      badge: tier.badge,
      cost: building.baseCost * tier.costFactor,
      desc: `${building.plural} produzieren doppelt so viel.`,
      effect: { type: 'building', building: building.id, mult: 2 },
      unlock: (s) => s.buildings[building.id] >= tier.require,
    }))
  ),
];

/* --------------------------------------------------------------------------
   Goldene Kekse – zufällige Effekte beim Anklicken (weight = Wahrscheinlichkeit)
   -------------------------------------------------------------------------- */
const GOLDEN_EFFECTS = [
  { id: 'lucky', weight: 50, icon: '🍀', title: 'Glücksfall!' },
  { id: 'frenzy', weight: 40, icon: '🔥', title: 'Raserei!', label: 'Raserei', mult: 7, duration: 77, target: 'Produktion' },
  { id: 'clickFrenzy', weight: 10, icon: '⚡', title: 'Klick-Rausch!', label: 'Klick-Rausch', mult: 777, duration: 13, target: 'Klicks' },
];

/* --------------------------------------------------------------------------
   Erfolge – check(state, info) mit info = { cps, buildings }
   -------------------------------------------------------------------------- */
const ACHIEVEMENTS = [
  // Insgesamt gebackene Kekse
  { id: 'bake-1', emoji: '🍪', name: 'Aufgewacht und gebacken', desc: 'Backe deinen ersten Keks.', check: (s) => s.totalBaked >= 1 },
  { id: 'bake-1k', emoji: '🧁', name: 'Hobbybäcker', desc: 'Backe insgesamt 1.000 Kekse.', check: (s) => s.totalBaked >= 1e3 },
  { id: 'bake-100k', emoji: '💼', name: 'Keks-Karriere', desc: 'Backe insgesamt 100.000 Kekse.', check: (s) => s.totalBaked >= 1e5 },
  { id: 'bake-1m', emoji: '💰', name: 'Krümel-Millionär', desc: 'Backe insgesamt 1 Million Kekse.', check: (s) => s.totalBaked >= 1e6 },
  { id: 'bake-100m', emoji: '🏰', name: 'Keks-Imperium', desc: 'Backe insgesamt 100 Millionen Kekse.', check: (s) => s.totalBaked >= 1e8 },
  { id: 'bake-10b', emoji: '🤑', name: 'Milliarden-Mampf', desc: 'Backe insgesamt 10 Milliarden Kekse.', check: (s) => s.totalBaked >= 1e10 },
  { id: 'bake-1t', emoji: '🌌', name: 'Galaktischer Bäcker', desc: 'Backe insgesamt 1 Billion Kekse.', check: (s) => s.totalBaked >= 1e12 },

  // Kekse pro Sekunde
  { id: 'cps-1', emoji: '⚙️', name: 'Läuft von allein', desc: 'Erreiche 1 Keks pro Sekunde.', check: (s, i) => i.cps >= 1 },
  { id: 'cps-10', emoji: '🏭', name: 'Fließbandarbeit', desc: 'Erreiche 10 Kekse pro Sekunde.', check: (s, i) => i.cps >= 10 },
  { id: 'cps-100', emoji: '🚂', name: 'Keks-Express', desc: 'Erreiche 100 Kekse pro Sekunde.', check: (s, i) => i.cps >= 100 },
  { id: 'cps-1k', emoji: '🌊', name: 'Keks-Tsunami', desc: 'Erreiche 1.000 Kekse pro Sekunde.', check: (s, i) => i.cps >= 1e3 },
  { id: 'cps-100k', emoji: '🌋', name: 'Keks-Vulkan', desc: 'Erreiche 100.000 Kekse pro Sekunde.', check: (s, i) => i.cps >= 1e5 },
  { id: 'cps-10m', emoji: '🕳️', name: 'Keks-Singularität', desc: 'Erreiche 10 Millionen Kekse pro Sekunde.', check: (s, i) => i.cps >= 1e7 },

  // Klicken
  { id: 'click-100', emoji: '☝️', name: 'Klick-Anfänger', desc: 'Klicke 100-mal auf den Keks.', check: (s) => s.clicks >= 100 },
  { id: 'click-1k', emoji: '🖱️', name: 'Klick-Maschine', desc: 'Klicke 1.000-mal auf den Keks.', check: (s) => s.clicks >= 1000 },
  { id: 'click-5k', emoji: '🩹', name: 'Sehnenscheidenentzündung', desc: 'Klicke 5.000-mal auf den Keks.', check: (s) => s.clicks >= 5000 },
  { id: 'hand-1m', emoji: '✋', name: 'Handgemacht', desc: 'Backe 1 Million Kekse per Klick.', check: (s) => s.handmade >= 1e6 },

  // Erstes Gebäude jeder Sorte (automatisch erzeugt)
  ...BUILDINGS.map((b) => ({
    id: `own-${b.id}`,
    emoji: b.emoji,
    name: b.firstAchievement.name,
    desc: b.firstAchievement.desc,
    check: (s) => s.buildings[b.id] >= 1,
  })),

  // Gebäude-Sammler
  { id: 'cursor-50', emoji: '🖐️', name: 'Finger-Armee', desc: 'Besitze 50 Cursor.', check: (s) => s.buildings.cursor >= 50 },
  { id: 'grandma-50', emoji: '🧶', name: 'Oma-Gang', desc: 'Besitze 50 Omas.', check: (s) => s.buildings.grandma >= 50 },
  { id: 'buildings-100', emoji: '🏗️', name: 'Bauboom', desc: 'Besitze insgesamt 100 Gebäude.', check: (s, i) => i.buildings >= 100 },
  { id: 'buildings-500', emoji: '🏙️', name: 'Stadtplaner', desc: 'Besitze insgesamt 500 Gebäude.', check: (s, i) => i.buildings >= 500 },

  // Goldene Kekse
  { id: 'golden-1', emoji: '✨', name: 'Goldrausch', desc: 'Klicke einen goldenen Keks.', check: (s) => s.goldenClicks >= 1 },
  { id: 'golden-7', emoji: '🍀', name: 'Glückspilz', desc: 'Klicke 7 goldene Kekse.', check: (s) => s.goldenClicks >= 7 },
  { id: 'golden-27', emoji: '👑', name: 'Gold wert', desc: 'Klicke 27 goldene Kekse.', check: (s) => s.goldenClicks >= 27 },

  // Upgrades
  { id: 'upgrades-10', emoji: '🔧', name: 'Upgrade-Junkie', desc: 'Kaufe 10 Upgrades.', check: (s) => s.upgrades.size >= 10 },
  { id: 'upgrades-30', emoji: '🧪', name: 'Technologie-Gigant', desc: 'Kaufe 30 Upgrades.', check: (s) => s.upgrades.size >= 30 },

  // Sonstiges
  { id: 'rename', emoji: '✏️', name: 'Namensgeber', desc: 'Gib deiner Bäckerei einen eigenen Namen.', check: (s) => s.flags.renamed },
  { id: 'comeback', emoji: '🏡', name: 'Willkommen zurück', desc: 'Komm nach mindestens einer Stunde Pause zurück.', check: (s) => s.flags.returned },
];

/* --------------------------------------------------------------------------
   News-Ticker – when(state) entscheidet, ob eine Meldung gerade passt
   -------------------------------------------------------------------------- */
const baked = (min, max = Infinity) => (s) => s.totalBaked >= min && s.totalBaked < max;
const owns = (id, count = 1) => (s) => s.buildings[id] >= count;

const NEWS = [
  // Die Geschichte deiner Bäckerei
  { text: 'Du hast Lust, Kekse zu backen. Aber niemand will deine Kekse essen.', when: baked(0, 5) },
  { text: 'Deine erste Ladung landet im Müll. Der Nachbarschafts-Waschbär rührt sie kaum an.', when: baked(5, 50) },
  { text: 'Deine Familie probiert deine Kekse. Es wird höflich genickt.', when: baked(50, 1000) },
  { text: 'Die Küche duftet himmlisch. Der Waschbär schaut jetzt öfter vorbei.', when: baked(50, 1000) },
  { text: 'Deine Kekse sind im Viertel beliebt. Die Nachbarn klingeln verdächtig oft.', when: baked(1000, 1e5) },
  { text: 'Lokalzeitung fragt: „Wer backt da eigentlich so viel?“', when: baked(1000, 1e5) },
  { text: 'Man spricht über deine Kekse wie über eine Legende.', when: baked(1e5, 1e7) },
  { text: 'Stadtrat diskutiert Sonderparkplätze vor deiner Bäckerei.', when: baked(1e5, 1e7) },
  { text: 'Eilmeldung: Deine Kekse sind in den Weltnachrichten!', when: baked(1e7, 1e9) },
  { text: 'Wirtschaftsexperten: Der Keks-Index hat den DAX überholt.', when: baked(1e7, 1e9) },
  { text: 'Wissenschaftler rätseln: Besteht das Universum inzwischen hauptsächlich aus Keksen?', when: baked(1e9) },
  { text: 'Außerirdische landen und bitten höflich um das Rezept.', when: baked(1e9) },

  // Gebäude
  { text: 'Cursor-Gewerkschaft fordert längere Pausen zwischen den Klicks.', when: owns('cursor') },
  { text: 'Oma: „Noch ein Blech, Schätzchen?“', when: owns('grandma') },
  { text: 'Omas gründen Strickclub. Gestrickt werden ausschließlich Keks-Muster.', when: owns('grandma', 10) },
  { text: 'Bauer berichtet: Keks-Weizen wächst prächtig, schmeckt aber nach Schokolade.', when: owns('farm') },
  { text: 'Bank führt Krümelkonto ein – Zinsen werden in Keksen ausgezahlt.', when: owns('bank') },
  { text: 'Zauberer verwandelt Frosch in Keks. Der Frosch hat keine Einwände.', when: owns('wizard') },
  { text: 'Aus dem Portal purzeln Kekse, die irgendwie nach Mittwoch schmecken.', when: owns('portal') },
  { text: 'Zeitreisender warnt: „Iss nicht den Keks von morgen!“', when: owns('timemachine') },
  { text: 'Physiker bestätigen: Antimaterie-Kekse haben negative Kalorien.', when: owns('antimatter') },
  { text: 'Regenbogen-Kekse gesichtet. Einhörner gelten als verdächtig.', when: owns('prism') },

  // Goldene Kekse & Tipps
  { text: 'Augenzeugen berichten von fliegenden goldenen Keksen. Die Behörden schweigen.', when: (s) => s.goldenClicks >= 1 },
  { text: 'Tipp: Goldene Kekse tauchen zufällig auf – schnell draufklicken!', when: baked(100) },
  { text: 'Tipp: Jeder Erfolg erhöht deine Keks-Produktion um 1 %.', when: baked(100) },
  { text: 'Tipp: Mit ×10 und ×100 im Shop kaufst du Gebäude im Paket.', when: baked(2000) },
  { text: 'Tipp: Auch wenn das Spiel zu ist, backen deine Gebäude mit halber Kraft weiter.', when: owns('grandma') },
];
