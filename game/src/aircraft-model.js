// The aircraft: a little sport plane built from flat-shaded polygons — tapered
// fuselage, low wing, tailplane, fin, canopy and a spinning prop disc — in the
// three catalogue liveries. Model space: x right, y up, z toward the tail, so
// the nose points along -z and the chase camera sees the plane from behind.
import { AIRCRAFT } from './config.js';
import { aircraftBasis } from './flight-model.js';

/** One quad of the model: four corner points and a paint role. */
function quad(points, role) {
  return { points, role };
}

/** Build the polygon list for an aircraft variant (proportions differ per type). */
export function buildAircraftModel(aircraftIndex) {
  const type = AIRCRAFT[aircraftIndex];
  const colours = type.colors;
  // Per-type proportions: Dart is longer and sleeker, Moth is stubbier with a big wing.
  const dims = [
    { length: 7.6, wingSpan: 11.5, wingChord: 1.9, bodyW: 1.5, bodyH: 1.6 },
    { length: 8.6, wingSpan: 10.2, wingChord: 1.55, bodyW: 1.35, bodyH: 1.4 },
    { length: 6.8, wingSpan: 12.6, wingChord: 2.2, bodyW: 1.6, bodyH: 1.7 },
  ][aircraftIndex];
  const L = dims.length;
  const noseZ = -L / 2;
  const tailZ = L / 2;
  const w = dims.bodyW / 2;
  const h = dims.bodyH / 2;
  const span = dims.wingSpan / 2;
  const chord = dims.wingChord;
  const wingZ = -0.4;

  const parts = [];
  // Fuselage: nose box tapering to a slimmer tail box (8 side quads + caps).
  const ring = (z, halfW, halfH, lift) => [
    [-halfW, -halfH + lift, z], [halfW, -halfH + lift, z],
    [halfW, halfH + lift, z], [-halfW, halfH + lift, z],
  ];
  const noseRing = ring(noseZ + 0.7, w * 0.62, h * 0.66, 0);
  const midRing = ring(-0.6, w, h, 0);
  const tailRing = ring(tailZ - 0.5, w * 0.34, h * 0.4, 0.18);
  const join = (a, b, role) => {
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      parts.push(quad([a[i], a[j], b[j], b[i]], role));
    }
  };
  join(noseRing, midRing, 'body');
  join(midRing, tailRing, 'body');
  parts.push(quad([noseRing[3], noseRing[2], noseRing[1], noseRing[0]], 'accent')); // nose cap
  // Main wing: one slab through the fuselage, accent tips.
  const wingY = -0.28;
  parts.push(quad([[-span, wingY, wingZ - chord / 2], [span, wingY, wingZ - chord / 2], [span, wingY, wingZ + chord / 2], [-span, wingY, wingZ + chord / 2]], 'wing'));
  parts.push(quad([[-span, wingY, wingZ + chord / 2], [span, wingY, wingZ + chord / 2], [span, wingY - 0.16, wingZ + chord / 2], [-span, wingY - 0.16, wingZ + chord / 2]], 'accent'));
  parts.push(quad([[-span, wingY, wingZ - chord / 2], [-span, wingY - 0.16, wingZ - chord / 2], [span, wingY - 0.16, wingZ - chord / 2], [span, wingY, wingZ - chord / 2]], 'accent'));
  // Tailplane and fin.
  const tailSpan = span * 0.55;
  parts.push(quad([[-tailSpan, 0.32, tailZ - 1.15], [tailSpan, 0.32, tailZ - 1.15], [tailSpan, 0.32, tailZ - 0.25], [-tailSpan, 0.32, tailZ - 0.25]], 'wing'));
  parts.push(quad([[0, 0.3, tailZ - 1.3], [0, 0.3, tailZ - 0.2], [0, 1.8, tailZ - 0.35], [0, 1.75, tailZ - 1.1]], 'accent'));
  parts.push(quad([[0, 0.3, tailZ - 0.2], [0, 0.3, tailZ - 1.3], [0, 1.75, tailZ - 1.1], [0, 1.8, tailZ - 0.35]], 'accent'));
  // Canopy: a dark bubble over the cockpit.
  parts.push(quad([[-w * 0.7, h * 0.55, -1.7], [w * 0.7, h * 0.55, -1.7], [w * 0.55, h * 0.92, -0.7], [-w * 0.55, h * 0.92, -0.7]], 'canopy'));
  parts.push(quad([[-w * 0.55, h * 0.92, -0.7], [w * 0.55, h * 0.92, -0.7], [w * 0.45, h * 0.7, 0.5], [-w * 0.45, h * 0.7, 0.5]], 'canopy'));
  // Fixed gear legs and spats.
  for (const side of [-1, 1]) {
    parts.push(quad([[side * 1.5, -0.35, wingZ - 0.2], [side * 1.7, -0.35, wingZ - 0.2], [side * 1.7, -1.15, wingZ], [side * 1.5, -1.15, wingZ]], 'accent'));
  }
  return { parts, colours, noseZ, propRadius: 1.35 };
}

/** Transform model points into world space at the flight's position and attitude. */
export function placeModel(model, flight) {
  const basis = aircraftBasis(flight);
  const placed = [];
  for (const part of model.parts) {
    const points = part.points.map(([mx, my, mz]) => ({
      x: flight.x + basis.right.x * mx + basis.up.x * my - basis.forward.x * mz,
      y: flight.y + basis.right.y * mx + basis.up.y * my - basis.forward.y * mz,
      z: flight.z + basis.right.z * mx + basis.up.z * my - basis.forward.z * mz,
    }));
    placed.push({ points, colour: model.colours[part.role] });
  }
  // Prop disc centre and radius direction, for the renderer to spin.
  const nose = {
    x: flight.x - basis.forward.x * model.noseZ,
    y: flight.y - basis.forward.y * model.noseZ,
    z: flight.z - basis.forward.z * model.noseZ,
  };
  return { polys: placed, nose, basis, propRadius: model.propRadius };
}
