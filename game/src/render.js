// The world renderer: hand-rolled 3D on Canvas 2D. Sky and sun first, then the
// sea, the island heightfield, trees, houses, lighthouse and runway as one
// depth-sorted polygon pass with distance fog, then the glowing rings, fuel
// cans, guide chevrons, clouds, smoke and finally the aircraft itself — the
// nearest thing in frame, drawn last. One dusk palette throughout.
import { PALETTE, WORLD } from './config.js';
import { clipNear, project, projectWorld, setViewport, toCamera } from './camera.js';
import { placeModel } from './aircraft-model.js';
import { ringCentreAt } from './missions.js';

const SUN = (() => {
  const v = { x: -0.68, y: 0.38, z: -0.34 };
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
})();

function fogged(rgb, depth, shade) {
  const f = Math.min(0.72, Math.max(0, (depth - 420) / 1750));
  const r = Math.round((rgb[0] * shade) * (1 - f) + PALETTE.fog[0] * f);
  const g = Math.round((rgb[1] * shade) * (1 - f) + PALETTE.fog[1] * f);
  const b = Math.round((rgb[2] * shade) * (1 - f) + PALETTE.fog[2] * f);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** A soft cloud puff sprite, painted once and blitted as a billboard. */
function makeCloudSprite() {
  const sprite = document.createElement('canvas');
  sprite.width = 256;
  sprite.height = 128;
  const ctx = sprite.getContext('2d');
  const blobs = [[70, 78, 46], [120, 62, 58], [172, 74, 48], [96, 84, 40], [150, 86, 42], [128, 92, 52]];
  for (const [x, y, r] of blobs) {
    const grad = ctx.createRadialGradient(x, y, 4, x, y, r);
    grad.addColorStop(0, 'rgba(255, 244, 230, 0.85)');
    grad.addColorStop(0.6, 'rgba(255, 238, 220, 0.45)');
    grad.addColorStop(1, 'rgba(255, 238, 220, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return sprite;
}

/** A radial halo sprite for fuel cans and nav lights. */
function makeHaloSprite(colour) {
  const sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const ctx = sprite.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, colour);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return sprite;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cloudSprite = makeCloudSprite();
  const haloGold = makeHaloSprite('rgba(255, 215, 106, 0.9)');
  const haloRed = makeHaloSprite('rgba(255, 80, 60, 0.9)');
  const haloGreen = makeHaloSprite('rgba(120, 255, 150, 0.9)');
  const smoke = [];
  let smokeClock = 0;
  let width = 0;
  let height = 0;

  function resize(camera) {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    width = Math.round(window.innerWidth * dpr);
    height = Math.round(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    setViewport(camera, width, height);
  }

  /** Project a world polygon, clip it, and queue it for the depth-sorted pass. */
  function queuePoly(list, camera, points, rgb, shade) {
    const camPoints = points.map((p) => toCamera(camera, p.x, p.y, p.z));
    let depth = 0;
    for (const p of camPoints) depth += p.z;
    depth /= camPoints.length;
    if (depth > WORLD.viewDistance) return;
    const clipped = clipNear(camPoints);
    if (clipped.length < 3) return;
    list.push({ points: clipped.map((p) => project(camera, p)), depth, fill: fogged(rgb, depth, shade) });
  }

  function drawSky(camera, flight) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.52, PALETTE.skyMid);
    grad.addColorStop(0.78, PALETTE.skyHorizon);
    grad.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // The low sun, placed by projecting a far point along the sun direction.
    const sunPoint = projectWorld(camera, flight.x + SUN.x * 3000, flight.y + SUN.y * 3000, flight.z + SUN.z * 3000);
    if (sunPoint) {
      const r = height * 0.34;
      const glow = ctx.createRadialGradient(sunPoint.x, sunPoint.y, 4, sunPoint.x, sunPoint.y, r);
      glow.addColorStop(0, 'rgba(255, 236, 190, 0.95)');
      glow.addColorStop(0.18, 'rgba(255, 205, 130, 0.55)');
      glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunPoint.x - r, sunPoint.y - r, r * 2, r * 2);
    }
  }

  function drawSea(camera) {
    const cell = 260;
    const range = 9;
    const baseX = Math.round(camera.x / cell);
    const baseZ = Math.round(camera.z / cell);
    const list = [];
    for (let gz = -range; gz <= range; gz += 1) {
      for (let gx = -range; gx <= range; gx += 1) {
        const x = (baseX + gx) * cell;
        const z = (baseZ + gz) * cell;
        const checker = ((baseX + gx + baseZ + gz) & 1) === 0;
        const rgb = checker ? PALETTE.seaDeep : PALETTE.seaLight;
        queuePoly(list, camera, [
          { x, y: 0, z }, { x: x + cell, y: 0, z }, { x: x + cell, y: 0, z: z + cell }, { x, y: 0, z: z + cell },
        ], rgb, 1);
      }
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const poly of list) {
      ctx.fillStyle = poly.fill;
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x, poly.points[0].y);
      for (let i = 1; i < poly.points.length; i += 1) ctx.lineTo(poly.points[i].x, poly.points[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawLand(camera, terrain) {
    const list = [];
    const cell = terrain.cell;
    for (const quad of terrain.quads) {
      const cx = quad.x + cell / 2;
      const cz = quad.z + cell / 2;
      const dx = cx - camera.x;
      const dz = cz - camera.z;
      if (dx * dx + dz * dz > WORLD.viewDistance * WORLD.viewDistance) continue;
      const dhdx = (quad.h10 + quad.h11 - quad.h00 - quad.h01) / (2 * cell);
      const dhdz = (quad.h01 + quad.h11 - quad.h00 - quad.h10) / (2 * cell);
      const inv = 1 / Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz);
      const shade = 0.72 + 0.5 * Math.max(0, (-dhdx * SUN.x + SUN.y - dhdz * SUN.z) * inv);
      queuePoly(list, camera, [
        { x: quad.x, y: quad.h00, z: quad.z },
        { x: quad.x + cell, y: quad.h10, z: quad.z },
        { x: quad.x + cell, y: quad.h11, z: quad.z + cell },
        { x: quad.x, y: quad.h01, z: quad.z + cell },
      ], quad.colour, shade);
    }
    // Trees: two crossed triangles each, only near ones.
    const treeRgb = [46, 96, 44];
    const treeRgb2 = [58, 112, 50];
    for (const tree of terrain.trees) {
      const dx = tree.x - camera.x;
      const dz = tree.z - camera.z;
      if (dx * dx + dz * dz > 1000 * 1000) continue;
      const hgt = 11 * tree.scale;
      const wid = 3.4 * tree.scale;
      const rgb = tree.hue > 0.5 ? treeRgb : treeRgb2;
      queuePoly(list, camera, [
        { x: tree.x - wid, y: tree.base, z: tree.z }, { x: tree.x + wid, y: tree.base, z: tree.z }, { x: tree.x, y: tree.base + hgt, z: tree.z },
      ], rgb, 0.95);
      queuePoly(list, camera, [
        { x: tree.x, y: tree.base, z: tree.z - wid }, { x: tree.x, y: tree.base, z: tree.z + wid }, { x: tree.x, y: tree.base + hgt, z: tree.z },
      ], rgb, 0.8);
    }
    // Harbour houses: walls + pitched roof.
    for (const house of terrain.houses) {
      const dx = house.x - camera.x;
      const dz = house.z - camera.z;
      if (dx * dx + dz * dz > 1400 * 1400) continue;
      const cos = Math.cos(house.rot);
      const sin = Math.sin(house.rot);
      const corner = (lx, ly, lz) => ({ x: house.x + lx * cos - lz * sin, y: house.base + ly, z: house.z + lx * sin + lz * cos });
      const hw = house.w / 2;
      const hd = house.d / 2;
      const wall = hexToRgb(house.wall);
      const roof = hexToRgb(house.roof);
      queuePoly(list, camera, [corner(-hw, 0, -hd), corner(hw, 0, -hd), corner(hw, house.h, -hd), corner(-hw, house.h, -hd)], wall, 0.9);
      queuePoly(list, camera, [corner(hw, 0, -hd), corner(hw, 0, hd), corner(hw, house.h, hd), corner(hw, house.h, -hd)], wall, 0.75);
      queuePoly(list, camera, [corner(-hw, house.h, -hd), corner(hw, house.h, -hd), corner(0, house.h + 3, 0), corner(-hw, house.h, hd)], roof, 1);
      queuePoly(list, camera, [corner(hw, house.h, -hd), corner(hw, house.h, hd), corner(0, house.h + 3, 0)], roof, 0.85);
    }
    // The grass strip: dark slab, white thresholds and centreline dashes.
    const rw = terrain.runway;
    const rCos = Math.cos(rw.angle);
    const rSin = Math.sin(rw.angle);
    const rPoint = (along, across) => ({
      x: rw.x + along * rCos - across * rSin,
      y: rw.base + 0.4,
      z: rw.z + along * rSin + across * rCos,
    });
    queuePoly(list, camera, [rPoint(-rw.length / 2, -rw.width / 2), rPoint(rw.length / 2, -rw.width / 2), rPoint(rw.length / 2, rw.width / 2), rPoint(-rw.length / 2, rw.width / 2)], [58, 64, 60], 1);
    for (let i = -3; i <= 3; i += 1) {
      queuePoly(list, camera, [rPoint(i * 46 - 12, -1.6), rPoint(i * 46 + 12, -1.6), rPoint(i * 46 + 12, 1.6), rPoint(i * 46 - 12, 1.6)], [240, 238, 228], 1);
    }
    // Lighthouse: banded cylinder and lamp room.
    const lh = terrain.lighthouse;
    const segments = 8;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p = (a, y, r) => ({ x: lh.x + Math.cos(a) * r, y: lh.base + y, z: lh.z + Math.sin(a) * r });
      queuePoly(list, camera, [p(a0, 0, lh.radius), p(a1, 0, lh.radius), p(a1, lh.height * 0.55, lh.radius * 0.8), p(a0, lh.height * 0.55, lh.radius * 0.8)], i % 2 ? [240, 236, 226] : [190, 64, 48], 0.95);
      queuePoly(list, camera, [p(a0, lh.height * 0.55, lh.radius * 0.8), p(a1, lh.height * 0.55, lh.radius * 0.8), p(a1, lh.height, lh.radius * 0.62), p(a0, lh.height, lh.radius * 0.62)], i % 2 ? [190, 64, 48] : [240, 236, 226], 0.9);
      queuePoly(list, camera, [p(a0, lh.height, lh.radius * 0.62), p(a1, lh.height, lh.radius * 0.62), p(a1, lh.height + 5, lh.radius * 0.5), p(a0, lh.height + 5, lh.radius * 0.5)], [40, 48, 56], 0.9);
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const poly of list) {
      ctx.fillStyle = poly.fill;
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x, poly.points[0].y);
      for (let i = 1; i < poly.points.length; i += 1) ctx.lineTo(poly.points[i].x, poly.points[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawLighthouseBeam(camera, terrain, t) {
    const lh = terrain.lighthouse;
    const lamp = { x: lh.x, y: lh.base + lh.height + 3, z: lh.z };
    const origin = projectWorld(camera, lamp.x, lamp.y, lamp.z);
    if (!origin) return;
    for (const flip of [0, Math.PI]) {
      const angle = t * 0.45 + flip;
      const tip = projectWorld(camera, lamp.x + Math.cos(angle) * 320, lamp.y - 26, lamp.z + Math.sin(angle) * 320);
      if (!tip) continue;
      ctx.fillStyle = 'rgba(255, 236, 170, 0.10)';
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(tip.x - 14, tip.y);
      ctx.lineTo(tip.x + 14, tip.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(camera, terrain) {
    const visible = [];
    for (const cloud of terrain.clouds) {
      const point = projectWorld(camera, cloud.x, cloud.y, cloud.z);
      if (!point || point.depth > WORLD.viewDistance) continue;
      visible.push({ point, cloud });
    }
    visible.sort((a, b) => b.point.depth - a.point.depth);
    for (const { point, cloud } of visible) {
      const w = (cloud.scale * camera.focal) / point.depth;
      ctx.globalAlpha = cloud.alpha;
      ctx.drawImage(cloudSprite, point.x - w / 2, point.y - w / 4, w, w / 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Ring circle points in world space, from the ring's normal basis. */
  function ringPoints(ringDef, centre, radius) {
    const n = { x: ringDef.nx, y: ringDef.ny, z: ringDef.nz };
    const helper = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const u = {
      x: n.y * helper.z - n.z * helper.y,
      y: n.z * helper.x - n.x * helper.z,
      z: n.x * helper.y - n.y * helper.x,
    };
    const ul = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z) || 1;
    u.x /= ul; u.y /= ul; u.z /= ul;
    const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
    const points = [];
    const segments = 28;
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const ca = Math.cos(a) * radius;
      const sa = Math.sin(a) * radius;
      points.push({
        x: centre.x + u.x * ca + v.x * sa,
        y: centre.y + u.y * ca + v.y * sa,
        z: centre.z + u.z * ca + v.z * sa,
      });
    }
    return points;
  }

  function drawRings(camera, flight, mission) {
    const t = flight.elapsed;
    // Far rings first so the next ring's glow sits on top.
    const order = mission.rings.map((_, i) => i).sort((a, b) => {
      const ca = ringCentreAt(mission, a, t);
      const cb = ringCentreAt(mission, b, t);
      const da = (ca.x - camera.x) ** 2 + (ca.z - camera.z) ** 2;
      const db = (cb.x - camera.x) ** 2 + (cb.z - camera.z) ** 2;
      return db - da;
    });
    for (const index of order) {
      const ringDef = mission.rings[index];
      const centre = ringCentreAt(mission, index, t);
      const centrePoint = projectWorld(camera, centre.x, centre.y, centre.z);
      if (!centrePoint || centrePoint.depth > WORLD.viewDistance) continue;
      const isNext = index === flight.ringIndex;
      const passed = index < flight.ringIndex;
      const pulse = isNext ? 1 + 0.035 * Math.sin(t * 3.2) : 1;
      const points = ringPoints(ringDef, centre, ringDef.radius * pulse)
        .map((p) => projectWorld(camera, p.x, p.y, p.z));
      if (points.some((p) => p === null)) continue;
      const lineWidth = Math.min(11, Math.max(2, 620 / centrePoint.depth));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      if (isNext) {
        ctx.fillStyle = 'rgba(255, 215, 106, 0.08)';
        ctx.fill();
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = 'rgba(255, 190, 60, 0.9)';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Number label at the top of the ring.
        const top = points.reduce((best, p) => (p.y < best.y ? p : best), points[0]);
        ctx.fillStyle = PALETTE.gold;
        ctx.font = `bold ${Math.round(Math.min(34, Math.max(13, 900 / centrePoint.depth)))}px 'Trebuchet MS', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(index + 1), top.x, top.y - 8);
        // A faint beacon from ring to sea, so the target reads from far off.
        const seaPoint = projectWorld(camera, centre.x, 0, centre.z);
        if (seaPoint) {
          ctx.strokeStyle = 'rgba(255, 215, 106, 0.16)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(centrePoint.x, centrePoint.y);
          ctx.lineTo(seaPoint.x, seaPoint.y);
          ctx.stroke();
        }
      } else if (passed) {
        ctx.strokeStyle = `rgba(141, 255, 154, ${0.25 + 0.55 * ringDef.flash})`;
        ctx.lineWidth = lineWidth * 0.8;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(111, 227, 255, 0.75)';
        ctx.lineWidth = lineWidth * 0.75;
        ctx.stroke();
      }
    }
  }

  function drawPickups(camera, flight) {
    const t = flight.elapsed;
    for (const pickup of flight.pickups) {
      if (pickup.taken) continue;
      const bobY = pickup.y + Math.sin(t * 1.6 + pickup.x) * 2;
      const point = projectWorld(camera, pickup.x, bobY, pickup.z);
      if (!point || point.depth > 1600) continue;
      const size = Math.min(46, Math.max(8, (14 * camera.focal) / point.depth));
      ctx.drawImage(haloGold, point.x - size, point.y - size, size * 2, size * 2);
      ctx.fillStyle = '#ffb26b';
      ctx.strokeStyle = '#7a4a12';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - size * 0.55);
      ctx.lineTo(point.x + size * 0.4, point.y);
      ctx.lineTo(point.x, point.y + size * 0.55);
      ctx.lineTo(point.x - size * 0.4, point.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5a3208';
      ctx.font = `bold ${Math.round(size * 0.5)}px 'Trebuchet MS', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('F', point.x, point.y + size * 0.18);
    }
  }

  function drawGuide(camera, flight, mission) {
    if (flight.ringIndex >= mission.rings.length) return;
    const centre = ringCentreAt(mission, flight.ringIndex, flight.elapsed);
    const dx = centre.x - flight.x;
    const dy = centre.y - flight.y;
    const dz = centre.z - flight.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 150) return;
    const steps = Math.min(14, Math.floor(dist / 55));
    for (let i = 1; i <= steps; i += 1) {
      const f = i / (steps + 1);
      const point = projectWorld(camera, flight.x + dx * f, flight.y + dy * f, flight.z + dz * f);
      if (!point) continue;
      const size = Math.min(13, Math.max(3, 260 / point.depth));
      ctx.strokeStyle = `rgba(255, 215, 106, ${0.75 - f * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - size);
      ctx.lineTo(point.x + size, point.y);
      ctx.lineTo(point.x, point.y + size);
      ctx.lineTo(point.x - size, point.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawAircraft(camera, flight, model) {
    const placed = placeModel(model, flight);
    const list = [];
    for (const poly of placed.polys) {
      const camPoints = poly.points.map((p) => toCamera(camera, p.x, p.y, p.z));
      let depth = 0;
      for (const p of camPoints) depth += p.z;
      depth /= camPoints.length;
      const clipped = clipNear(camPoints);
      if (clipped.length < 3) continue;
      // Face shade from the world-space normal against the sun.
      const [a, b, c] = poly.points;
      const ux = b.x - a.x; const uy = b.y - a.y; const uz = b.z - a.z;
      const vx = c.x - a.x; const vy = c.y - a.y; const vz = c.z - a.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const shade = 0.62 + 0.5 * Math.abs((nx * SUN.x + ny * SUN.y + nz * SUN.z) / nl);
      list.push({ points: clipped.map((p) => project(camera, p)), depth, fill: fogged(hexToRgb(poly.colour), depth, shade) });
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const poly of list) {
      ctx.fillStyle = poly.fill;
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x, poly.points[0].y);
      for (let i = 1; i < poly.points.length; i += 1) ctx.lineTo(poly.points[i].x, poly.points[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Prop disc: a translucent blur with two blades, spinning with the engine.
    const nosePoint = projectWorld(camera, placed.nose.x, placed.nose.y, placed.nose.z);
    if (nosePoint) {
      const r = (placed.propRadius * camera.focal) / nosePoint.depth;
      ctx.fillStyle = 'rgba(30, 34, 40, 0.16)';
      ctx.beginPath();
      ctx.arc(nosePoint.x, nosePoint.y, r, 0, Math.PI * 2);
      ctx.fill();
      const spin = flight.elapsed * (6 + flight.throttle * 34);
      ctx.strokeStyle = 'rgba(20, 24, 30, 0.65)';
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(nosePoint.x + Math.cos(spin) * r, nosePoint.y + Math.sin(spin) * r);
      ctx.lineTo(nosePoint.x - Math.cos(spin) * r, nosePoint.y - Math.sin(spin) * r);
      ctx.stroke();
    }
    // Nav lights: red port, green starboard, blinking tail strobe.
    const basis = placed.basis;
    const span = 5.6;
    const lights = [
      { sprite: haloRed, sign: -1, on: true },
      { sprite: haloGreen, sign: 1, on: true },
    ];
    for (const light of lights) {
      const point = projectWorld(
        camera,
        flight.x + basis.right.x * span * light.sign,
        flight.y + basis.right.y * span * light.sign - 0.3,
        flight.z + basis.right.z * span * light.sign,
      );
      if (!point) continue;
      const size = Math.min(30, Math.max(7, 300 / point.depth));
      ctx.drawImage(light.sprite, point.x - size / 2, point.y - size / 2, size, size);
    }
  }

  function drawSmoke(camera, flight, dt) {
    smokeClock += dt;
    if (flight.damage >= 50 && !flight.finished && smokeClock > 0.07) {
      smokeClock = 0;
      smoke.push({ x: flight.x, y: flight.y, z: flight.z, born: flight.elapsed, drift: (smoke.length % 5) - 2 });
      if (smoke.length > 40) smoke.shift();
    }
    for (let i = smoke.length - 1; i >= 0; i -= 1) {
      const puff = smoke[i];
      const age = flight.elapsed - puff.born;
      if (age > 1.4) {
        smoke.splice(i, 1);
        continue;
      }
      const point = projectWorld(camera, puff.x + puff.drift * age, puff.y + age * 3, puff.z);
      if (!point) continue;
      const size = (2 + age * 7) * camera.focal / point.depth;
      ctx.fillStyle = `rgba(60, 58, 56, ${0.4 * (1 - age / 1.4)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(2, size), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPopups(camera, flight) {
    ctx.textAlign = 'center';
    for (const popup of flight.popups) {
      const age = flight.elapsed - popup.born;
      const point = projectWorld(camera, popup.x, popup.y, popup.z);
      if (!point) continue;
      const alpha = Math.max(0, 1 - age / 1.5);
      ctx.font = `bold ${Math.round(Math.min(30, Math.max(14, 800 / point.depth)))}px 'Trebuchet MS', sans-serif`;
      ctx.fillStyle = `rgba(255, 215, 106, ${alpha})`;
      ctx.fillText(popup.text, point.x, point.y - age * 42);
    }
  }

  /**
   * Paint the whole 3D world for one frame. game = {terrain, flight, mission,
   * camera, model}; dt is the frame's elapsed sim time (for smoke pacing).
   */
  function drawWorld(game, dt) {
    const { terrain, flight, mission, camera, model } = game;
    resize(camera);
    drawSky(camera, flight);
    drawSea(camera);
    drawLand(camera, terrain);
    drawLighthouseBeam(camera, terrain, flight.elapsed);
    drawRings(camera, flight, mission);
    drawPickups(camera, flight);
    drawGuide(camera, flight, mission);
    drawClouds(camera, terrain);
    drawSmoke(camera, flight, dt);
    drawAircraft(camera, flight, model);
    drawPopups(camera, flight);
  }

  return { drawWorld, ctx, size: () => ({ width, height }) };
}
