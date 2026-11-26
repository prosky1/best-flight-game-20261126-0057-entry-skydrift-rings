// The archipelago: a heightfield of island bumps over a teal sea, dressed with
// cone trees, a lighthouse, harbour houses, a grass strip and drifting cloud puffs.
// The mesh is precomputed once (grid heights + per-quad colours); heightAt() reads
// the same grid the renderer draws, so what the pilot sees is what the pilot hits.
import { ISLANDS, LIGHTHOUSE, PALETTE, RUNWAY, WORLD } from './config.js';
import { createRandom, valueNoise } from './random.js';

/** Grid resolution: one vertex every CELL metres across the 4000 m world. */
const CELL = 55;
const GRID = Math.floor((WORLD.half * 2) / CELL) + 1;

/** Analytic island height before grid sampling: smooth bumps roughened by noise. */
function analyticHeight(x, z) {
  let height = -7; // seabed
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const cos = Math.cos(island.angle);
    const sin = Math.sin(island.angle);
    const along = (dx * cos + dz * sin) / island.elong;
    const across = -dx * sin + dz * cos;
    const dist = Math.sqrt(along * along + across * across);
    if (dist >= island.radius) continue;
    const t = 1 - dist / island.radius;
    const falloff = t * t * (3 - 2 * t);
    const rough = 0.72 + 0.5 * valueNoise(x, z, 210, island.seed) + 0.18 * valueNoise(x, z, 70, island.seed + 5);
    height = Math.max(height, island.peak * falloff * rough);
  }
  return height;
}

/** Flat-shade colour for a quad, from its mean height, slope and a noise tint. */
function quadColour(meanHeight, slope, x, z) {
  const tint = 0.92 + 0.16 * valueNoise(x, z, 160, 97);
  let base;
  if (meanHeight < 2.4) base = PALETTE.sand;
  else if (meanHeight < 58) base = valueNoise(x, z, 300, 31) > 0.5 ? PALETTE.grassLow : PALETTE.grassHigh;
  else if (meanHeight < 112) base = PALETTE.rock;
  else base = PALETTE.peak;
  if (slope > 0.85 && meanHeight >= 2.4) base = PALETTE.rock;
  return [Math.min(255, base[0] * tint), Math.min(255, base[1] * tint), Math.min(255, base[2] * tint)];
}

/** Scatter cone trees on grassy, gentle ground. */
function scatterTrees(random, heightAt) {
  const trees = [];
  let guard = 0;
  while (trees.length < 280 && guard < 6000) {
    guard += 1;
    const x = random.range(-WORLD.half + 80, WORLD.half - 80);
    const z = random.range(-WORLD.half + 80, WORLD.half - 80);
    const h = heightAt(x, z);
    if (h < 4 || h > 62) continue;
    const slope = Math.abs(heightAt(x + 14, z) - h) + Math.abs(heightAt(x, z + 14) - h);
    if (slope > 9) continue;
    trees.push({ x, z, base: h, scale: random.range(0.8, 1.5), hue: random.next() });
  }
  return trees;
}

/** A little harbour village on Harbor Isle's south shore. */
function scatterHouses(random, heightAt) {
  const houses = [];
  const roofs = ['#b5523c', '#8a4a3a', '#c96f4a', '#7d5a44'];
  const walls = ['#f0e6d2', '#e3d3ae', '#d9c9a8', '#efe3cc'];
  let guard = 0;
  while (houses.length < 15 && guard < 3000) {
    guard += 1;
    const x = random.range(-420, 420);
    const z = random.range(-80, 240);
    const h = heightAt(x, z);
    if (h < 3 || h > 40) continue;
    houses.push({
      x, z, base: h,
      rot: random.range(0, Math.PI),
      w: random.range(11, 17), d: random.range(9, 13), h: random.range(6, 9),
      roof: random.pick(roofs), wall: random.pick(walls),
    });
  }
  return houses;
}

/** Cloud puffs: positions and scales only; the sprite itself is painted by render.js. */
function scatterClouds(random) {
  const clouds = [];
  for (let i = 0; i < 38; i += 1) {
    clouds.push({
      x: random.range(-WORLD.half, WORLD.half),
      y: random.range(280, 430),
      z: random.range(-WORLD.half, WORLD.half),
      scale: random.range(90, 210),
      alpha: random.range(0.5, 0.85),
    });
  }
  return clouds;
}

/**
 * Build the whole world for a seed. Returns the grid (for the renderer), a
 * heightAt(x, z) collision sampler, and the dressing lists.
 */
export function createTerrain(seed) {
  const heights = new Float32Array(GRID * GRID);
  for (let gz = 0; gz < GRID; gz += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const x = -WORLD.half + gx * CELL;
      const z = -WORLD.half + gz * CELL;
      heights[gz * GRID + gx] = analyticHeight(x, z);
    }
  }

  /** Bilinear height from the grid — the one height both mesh and collision use. */
  function heightAt(x, z) {
    const fx = Math.min(GRID - 1.001, Math.max(0, (x + WORLD.half) / CELL));
    const fz = Math.min(GRID - 1.001, Math.max(0, (z + WORLD.half) / CELL));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * GRID + ix];
    const b = heights[iz * GRID + ix + 1];
    const c = heights[(iz + 1) * GRID + ix];
    const d = heights[(iz + 1) * GRID + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  // Per-quad colours, precomputed: the world never changes shape, only the fog does.
  const quads = [];
  for (let gz = 0; gz < GRID - 1; gz += 1) {
    for (let gx = 0; gx < GRID - 1; gx += 1) {
      const x = -WORLD.half + gx * CELL;
      const z = -WORLD.half + gz * CELL;
      const h00 = heights[gz * GRID + gx];
      const h10 = heights[gz * GRID + gx + 1];
      const h01 = heights[(gz + 1) * GRID + gx];
      const h11 = heights[(gz + 1) * GRID + gx + 1];
      const mean = (h00 + h10 + h01 + h11) / 4;
      if (mean < -1.5 && Math.max(h00, h10, h01, h11) < 0.4) continue; // open sea: the sea plane covers it
      const slope = (Math.abs(h10 - h00) + Math.abs(h01 - h00)) / CELL;
      quads.push({ x, z, h00, h10, h01, h11, colour: quadColour(mean, slope, x + CELL / 2, z + CELL / 2) });
    }
  }

  const random = createRandom(seed);
  const lighthouseBase = heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const runwayBase = heightAt(RUNWAY.x, RUNWAY.z);

  return {
    cell: CELL,
    quads,
    heightAt,
    trees: scatterTrees(random, heightAt),
    houses: scatterHouses(random, heightAt),
    clouds: scatterClouds(random),
    lighthouse: { ...LIGHTHOUSE, base: lighthouseBase },
    runway: { ...RUNWAY, base: runwayBase },
  };
}
