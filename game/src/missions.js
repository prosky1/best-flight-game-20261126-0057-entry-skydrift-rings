// The six sorties: ring courses over the archipelago in three course types —
// plain ring runs, a fuel-limited run, and crosswind/storm runs with swaying
// rings. Each sortie carries a par time, a hard clock, ring time bonuses, wind,
// fuel pickups and the star/grade rules the debrief grades by.
import { START_POSE } from './config.js';

/** Course type ids, shown on the briefing list. */
export const TYPE_RING_RUN = 'RING RUN';
export const TYPE_FUEL_RUN = 'FUEL RUN';
export const TYPE_CROSSWIND = 'CROSSWIND';
export const TYPE_STORM = 'STORM LINE';
export const TYPE_GRAND = 'GRAND TOUR';

/**
 * Build one ring: centre, radius, and the plane normal the pilot must cross.
 * The normal points along the course (from the previous ring toward this one),
 * so threading it either way counts but the approach reads naturally.
 */
function ring(x, y, z, radius, from) {
  let nx = x - from.x;
  let ny = y - from.y;
  let nz = z - from.z;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len; ny /= len; nz /= len;
  return { x, y, z, radius, nx, ny, nz, flash: 0 };
}

function course(points, radius) {
  const rings = [];
  let from = { x: START_POSE.x, y: START_POSE.y, z: START_POSE.z };
  for (const [x, y, z] of points) {
    rings.push(ring(x, y, z, radius, from));
    from = { x, y, z };
  }
  return rings;
}

/**
 * Where a ring's centre is at mission time t. Storm rings sway on a slow sine;
 * every other ring is fixed. Flight model and renderer both call this, so the
 * ring the pilot sees is the ring the rules judge.
 */
export function ringCentreAt(mission, index, t) {
  const r = mission.rings[index];
  if (!mission.sway) return { x: r.x, y: r.y, z: r.z };
  return {
    x: r.x + Math.cos(t * 0.45 + index * 1.7) * 5,
    y: r.y + Math.sin(t * 0.6 + index * 1.3) * 7,
    z: r.z,
  };
}

/** The six sorties, easiest first. Par is the target clock; the hard clock is par + slack. */
export const MISSIONS = [
  {
    name: 'HARBOR HOP',
    type: TYPE_RING_RUN,
    brief: 'A gentle lap of Harbor Isle. Learn the rings, mind the clock.',
    par: 150,
    slack: 60,
    ringBonus: 12,
    startFuel: 1.0,
    fuelRate: 0.85,
    wind: { dir: 0.8, speed: 2 },
    sway: false,
    rings: course([
      [0, 95, 300], [500, 115, -260], [170, 135, -830],
      [-458, 115, -432], [-360, 95, 160], [0, 105, 620],
    ], 27),
    pickups: [[400, 100, -560], [-317, 100, 65]],
  },
  {
    name: 'ISLAND WEAVE',
    type: TYPE_RING_RUN,
    brief: 'Thread West Cay, the South Islet and East Peak in one long weave.',
    par: 205,
    slack: 60,
    ringBonus: 11,
    startFuel: 1.0,
    fuelRate: 1.0,
    wind: { dir: 2.4, speed: 5 },
    sway: false,
    rings: course([
      [0, 85, 240], [-700, 65, -80], [-1257, 95, 565], [-520, 55, 680],
      [100, 75, 920], [720, 65, 320], [1480, 105, -160], [620, 85, -720], [-1, 115, -788],
    ], 23),
    pickups: [[-843, 80, 83], [420, 70, 560], [843, 90, -445]],
  },
  {
    name: 'LOW TIDE',
    type: TYPE_FUEL_RUN,
    brief: 'Half a tank and no mercy. Every fuel can on the course counts.',
    par: 185,
    slack: 55,
    ringBonus: 11,
    startFuel: 0.55,
    fuelRate: 1.05,
    wind: { dir: 1.2, speed: 3 },
    sway: false,
    rings: course([
      [-80, 80, 260], [-560, 60, -260], [-1080, 85, -140], [-640, 55, 520],
      [60, 70, 760], [560, 60, 180], [943, 90, -505], [300, 105, -680],
    ], 23),
    pickups: [[-320, 70, 40], [-740, 70, 300], [300, 65, 470], [705, 75, 5]],
  },
  {
    name: 'CROSSWIND CAY',
    type: TYPE_CROSSWIND,
    brief: 'A hard westerly all day. Crab into it or drift off the line.',
    par: 225,
    slack: 60,
    ringBonus: 10,
    startFuel: 1.0,
    fuelRate: 1.1,
    wind: { dir: Math.PI / 2, speed: 12 },
    sway: false,
    rings: course([
      [60, 90, 220], [520, 70, -320], [1409, 110, 47], [720, 70, 520],
      [103, 60, 875], [-480, 70, 480], [-1013, 100, -119], [-600, 85, -600],
      [-180, 110, -760], [320, 120, -900],
    ], 21),
    pickups: [[682, 90, -129], [-160, 65, 660], [-940, 90, -140]],
  },
  {
    name: 'STORM LINE',
    type: TYPE_STORM,
    brief: 'The rings themselves are moving. Thread them on the swing.',
    par: 255,
    slack: 60,
    ringBonus: 9,
    startFuel: 1.0,
    fuelRate: 1.2,
    wind: { dir: 2.9, speed: 16 },
    sway: true,
    rings: course([
      [0, 80, 200], [-520, 60, -180], [-1150, 90, 600], [-700, 55, 620],
      [40, 65, 900], [640, 60, 420], [1460, 95, -80], [820, 70, -620],
      [180, 100, -860], [-420, 85, -560], [-880, 95, -700], [-194, 110, -969],
    ], 19),
    pickups: [[-830, 75, 30], [340, 60, 660], [867, 80, -463], [-147, 95, -757]],
  },
  {
    name: 'GRAND CIRCUIT',
    type: TYPE_GRAND,
    brief: 'Every island, every ring, one clock. The full archipelago tour.',
    par: 295,
    slack: 65,
    ringBonus: 9,
    startFuel: 1.0,
    fuelRate: 1.15,
    wind: { dir: 0.4, speed: 9 },
    sway: true,
    rings: course([
      [40, 90, 260], [560, 75, -240], [1480, 110, -120], [840, 70, 480],
      [100, 60, 900], [-420, 70, 620], [-1018, 95, 596], [-860, 65, -260],
      [-300, 95, -820], [300, 115, -860], [700, 85, -980], [152, 120, -1018],
      [-677, 100, -1065], [-362, 110, -612],
    ], 20),
    pickups: [[675, 90, -103], [-80, 65, 760], [-880, 80, 20], [460, 95, -840]],
  },
];

/** Wind as a world vector (m/s). dir is a heading the wind blows TOWARD. */
export function windVector(mission) {
  return {
    x: Math.sin(mission.wind.dir) * mission.wind.speed,
    z: -Math.cos(mission.wind.dir) * mission.wind.speed,
  };
}

/** Format seconds as M:SS for clocks and pars. */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Grade a finished sortie. Returns the stamp letter, the three stars
 * (all rings / under par / no damage) and a one-line verdict.
 */
export function gradeSortie(mission, result) {
  const stars = [
    result.ringsPassed >= mission.rings.length,
    result.elapsed <= mission.par,
    result.damage <= 0,
  ];
  const starCount = stars.filter(Boolean).length;
  let grade = 'C';
  if (result.complete && starCount === 3) grade = 'S';
  else if (result.complete && starCount === 2) grade = 'A';
  else if (result.complete) grade = 'B';
  const verdicts = {
    S: 'Flawless. The tower barely looked up.',
    A: 'Clean flying. The archipelago approves.',
    B: 'Home safe. A few paint scratches to explain.',
    C: result.complete ? 'You got there. The rings remember otherwise.' : 'The sea keeps what the sky drops.',
  };
  return { grade, stars, starCount, verdict: verdicts[grade] };
}
