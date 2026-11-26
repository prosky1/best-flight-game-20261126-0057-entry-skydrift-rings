// Skydrift Rings — tuning, palette and catalogue data.
// One art direction everywhere: a dusk archipelago (teal sea, amber sky) flown with
// brass-rimmed instruments on deep-teal glass. World, aircraft and HUD all read from
// PALETTE so the whole game shares one look.

/** Fixed simulation step (seconds). The world advances in these steps only. */
export const STEP = 1 / 60;

/** World extents in metres. x east, y up, z south (north is -z). Sea level is y = 0. */
export const WORLD = {
  half: 2000,
  ceiling: 540,
  viewDistance: 2400,
};

/** localStorage key for scrip, upgrades, aircraft choice and per-sortie bests. */
export const SAVE_KEY = 'skydrift-rings-save-v1';

/** The single palette: dusk sky, teal sea, brass instruments, cream numerals. */
export const PALETTE = {
  skyTop: '#27436e',
  skyMid: '#6f9fd8',
  skyHorizon: '#ffb26b',
  sunGlow: '#ffd9a0',
  fog: [247, 196, 138],
  seaDeep: [18, 98, 104],
  seaLight: [25, 120, 124],
  sand: [232, 210, 154],
  grassLow: [93, 162, 74],
  grassHigh: [62, 125, 58],
  rock: [138, 127, 116],
  peak: [207, 200, 189],
  panel: 'rgba(8, 32, 36, 0.84)',
  panelEdge: '#c9a227',
  panelEdgeDim: 'rgba(201, 162, 39, 0.45)',
  text: '#f5ead2',
  textDim: '#b8c4c0',
  gold: '#ffd76a',
  cyan: '#6fe3ff',
  ringPassed: '#8dff9a',
  warn: '#ffb26b',
  danger: '#ff5a4d',
  good: '#8dff9a',
};

/**
 * The three aircraft. Speeds are metres/second; the HUD shows km/h.
 * turn multiplies the coordinated-turn rate; fuelCap is tank units before upgrades.
 */
export const AIRCRAFT = [
  {
    id: 'skimmer',
    name: 'SKIMMER',
    tagline: 'Balanced trainer. Forgiving stall, honest speed.',
    maxSpeed: 96,
    minSpeed: 30,
    stallSpeed: 26,
    turn: 1.0,
    fuelCap: 100,
    colors: { body: '#c73e2e', accent: '#f2ead8', wing: '#e6dcc4', canopy: '#22303c' },
  },
  {
    id: 'dart',
    name: 'DART',
    tagline: 'Fast courier. Quick, twitchy, thirsty.',
    maxSpeed: 120,
    minSpeed: 36,
    stallSpeed: 31,
    turn: 0.86,
    fuelCap: 86,
    colors: { body: '#2e7f86', accent: '#e8c766', wing: '#256a70', canopy: '#16222c' },
  },
  {
    id: 'moth',
    name: 'MOTH',
    tagline: 'Slow and nimble. Turns on a wingtip, sips fuel.',
    maxSpeed: 84,
    minSpeed: 26,
    stallSpeed: 22,
    turn: 1.28,
    fuelCap: 112,
    colors: { body: '#e8e2d4', accent: '#e2725b', wing: '#d8d0bc', canopy: '#2c3440' },
  },
];

/**
 * The twelve between-sortie upgrades: three tracks of four marks, bought with scrip.
 * perLevel is the fractional gain each mark adds.
 */
export const UPGRADES = [
  {
    id: 'engine',
    name: 'ENGINE',
    desc: '+6% top speed per mark',
    prices: [100, 200, 350, 550],
    perLevel: 0.06,
  },
  {
    id: 'tank',
    name: 'FUEL TANK',
    desc: '+12% fuel capacity per mark',
    prices: [80, 160, 280, 450],
    perLevel: 0.12,
  },
  {
    id: 'handling',
    name: 'HANDLING',
    desc: '+8% turn rate per mark',
    prices: [80, 160, 280, 450],
    perLevel: 0.08,
  },
];

/**
 * The archipelago: island bumps the heightfield is built from.
 * elong stretches the bump along angle (radians, direction of the long axis).
 */
export const ISLANDS = [
  { name: 'Harbor Isle', x: 0, z: -300, radius: 540, peak: 150, elong: 1.0, angle: 0.4, seed: 11 },
  { name: 'West Cay', x: -1150, z: 220, radius: 390, peak: 122, elong: 1.25, angle: 0.9, seed: 23 },
  { name: 'East Peak', x: 1080, z: -140, radius: 430, peak: 172, elong: 1.1, angle: 2.2, seed: 37 },
  { name: 'South Islet', x: 320, z: 980, radius: 270, peak: 72, elong: 1.35, angle: 1.7, seed: 41 },
  { name: 'North Ridge', x: -260, z: -1420, radius: 500, peak: 112, elong: 1.7, angle: 0.2, seed: 53 },
  { name: 'Pebble', x: -620, z: -950, radius: 170, peak: 48, elong: 1.0, angle: 0.0, seed: 67 },
  { name: 'Pebble East', x: 760, z: 620, radius: 150, peak: 40, elong: 1.2, angle: 2.8, seed: 71 },
];

/** The lighthouse on Harbor Isle's north point — a landmark and a collision obstacle. */
export const LIGHTHOUSE = { x: 150, z: -800, height: 46, radius: 13 };

/** A scenic grass strip on Harbor Isle's south flats, with a windsock. */
export const RUNWAY = { x: -140, z: 60, length: 420, width: 34, angle: 0.5 };

/** Where every sortie starts: over the sea south of Harbor Isle, heading north. */
export const START_POSE = { x: -160, y: 130, z: 980, heading: 0.12, speed: 52 };
