// The flight model: one aircraft, flown by throttle, pitch and bank.
// Throttle buys speed, speed buys control authority; climb bleeds speed, dive
// buys it back, and below stall speed the nose drops whether the pilot agrees
// or not. Fuel burns with throttle, terrain strikes dent the airframe, rings
// are judged by plane-crossing, and every interesting moment raises an event
// the HUD and audio react to.
import { AIRCRAFT, START_POSE, UPGRADES, WORLD } from './config.js';
import { ringCentreAt, windVector } from './missions.js';

/** Event bits returned by stepFlight. */
export const EVENT_RING = 1;
export const EVENT_MISS = 2;
export const EVENT_PICKUP = 4;
export const EVENT_GRAZE = 8;
export const EVENT_CRASH = 16;
export const EVENT_DITCH = 32;
export const EVENT_TIMEOUT = 64;
export const EVENT_COMPLETE = 128;
export const EVENT_STALL = 256;

/** Named fuel states, worst last: FULL → LOW → RESERVE → BINGO → DRY. */
export function fuelState(fraction) {
  if (fraction <= 0) return 'DRY';
  if (fraction <= 0.08) return 'BINGO';
  if (fraction <= 0.2) return 'RESERVE';
  if (fraction <= 0.4) return 'LOW';
  return 'FULL';
}

/** Named airframe states: SOUND → DENTED → HURT → CRITICAL. */
export function damageState(damage) {
  if (damage >= 75) return 'CRITICAL';
  if (damage >= 50) return 'HURT';
  if (damage >= 25) return 'DENTED';
  return 'SOUND';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a >= Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Effective performance of an aircraft with the owned upgrades applied:
 * engine marks raise top speed, tank marks raise capacity, handling marks
 * raise the turn rate.
 */
export function performance(aircraftIndex, upgrades) {
  const base = AIRCRAFT[aircraftIndex];
  const engine = 1 + upgrades.engine * UPGRADES[0].perLevel;
  const tank = 1 + upgrades.tank * UPGRADES[1].perLevel;
  const handling = 1 + upgrades.handling * UPGRADES[2].perLevel;
  return {
    maxSpeed: base.maxSpeed * engine,
    minSpeed: base.minSpeed,
    stallSpeed: base.stallSpeed,
    turn: base.turn * handling,
    fuelCap: base.fuelCap * tank,
  };
}

/** Fresh flight state at the start pose, fuelled per the mission. */
export function createFlight(mission, aircraftIndex, upgrades) {
  const perf = performance(aircraftIndex, upgrades);
  return {
    perf,
    aircraftIndex,
    x: START_POSE.x, y: START_POSE.y, z: START_POSE.z,
    prevX: START_POSE.x, prevY: START_POSE.y, prevZ: START_POSE.z,
    heading: START_POSE.heading,
    pitch: 0,
    roll: 0,
    speed: START_POSE.speed,
    throttle: 0.55,
    fuel: perf.fuelCap * mission.startFuel,
    damage: 0,
    elapsed: 0,
    timeLeft: mission.par + mission.slack,
    score: 0,
    ringIndex: 0,
    ringsPassed: 0,
    ringPoints: 0,
    accuracyPoints: 0,
    pickupsTaken: 0,
    stalled: false,
    engineDead: false,
    finished: false,
    outcome: null, // 'complete' | 'crash' | 'ditch' | 'timeout'
    popups: [], // {x,y,z,text,born} floating score text at rings
    callout: null, // {text, born, tone} big centre-screen message
    missCooldown: 0,
    grazeCooldown: 0,
    smokeTimer: 0,
  };
}

/** Unit forward vector from heading and pitch. */
export function forwardVector(heading, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(heading) * cp, y: Math.sin(pitch), z: -Math.cos(heading) * cp };
}

/**
 * The aircraft's orthonormal basis (right, up, forward) with bank applied.
 * Shared by the renderer (to draw the model) and the camera (to trail it).
 */
export function aircraftBasis(flight) {
  const f = forwardVector(flight.heading, flight.pitch);
  const r0 = { x: Math.cos(flight.heading), y: 0, z: Math.sin(flight.heading) };
  // up0 = r0 × f
  const u0 = {
    x: r0.y * f.z - r0.z * f.y,
    y: r0.z * f.x - r0.x * f.z,
    z: r0.x * f.y - r0.y * f.x,
  };
  const cr = Math.cos(flight.roll);
  const sr = Math.sin(flight.roll);
  return {
    right: { x: r0.x * cr - u0.x * sr, y: r0.y * cr - u0.y * sr, z: r0.z * cr - u0.z * sr },
    up: { x: u0.x * cr + r0.x * sr, y: u0.y * cr + r0.y * sr, z: u0.z * cr + r0.z * sr },
    forward: f,
  };
}

/** Distance and bearing (radians, relative to heading) to the next ring. */
export function nextRingInfo(flight, mission) {
  if (flight.ringIndex >= mission.rings.length) return null;
  const centre = ringCentreAt(mission, flight.ringIndex, flight.elapsed);
  const dx = centre.x - flight.x;
  const dy = centre.y - flight.y;
  const dz = centre.z - flight.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const bearing = Math.atan2(dx, -dz);
  return { centre, distance, bearingError: wrapAngle(bearing - flight.heading) };
}

function setCallout(flight, text, tone) {
  flight.callout = { text, born: flight.elapsed, tone: tone ?? 'gold' };
}

/** Judge the next ring: a plane crossing inside the disc passes, outside misses. */
function judgeRing(flight, mission, events) {
  if (flight.ringIndex >= mission.rings.length) return events;
  const ringDef = mission.rings[flight.ringIndex];
  const centre = ringCentreAt(mission, flight.ringIndex, flight.elapsed);
  const prevSide = (flight.prevX - centre.x) * ringDef.nx + (flight.prevY - centre.y) * ringDef.ny + (flight.prevZ - centre.z) * ringDef.nz;
  const side = (flight.x - centre.x) * ringDef.nx + (flight.y - centre.y) * ringDef.ny + (flight.z - centre.z) * ringDef.nz;
  if ((prevSide <= 0 && side > 0) || (prevSide >= 0 && side < 0)) {
    const rx = flight.x - centre.x - ringDef.nx * side;
    const ry = flight.y - centre.y - ringDef.ny * side;
    const rz = flight.z - centre.z - ringDef.nz * side;
    const radial = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (radial <= ringDef.radius) {
      const accuracy = Math.round(50 * (1 - radial / ringDef.radius));
      flight.ringPoints += 100;
      flight.accuracyPoints += accuracy;
      flight.score += 100 + accuracy;
      flight.timeLeft += mission.ringBonus;
      flight.ringsPassed += 1;
      ringDef.flash = 1;
      flight.popups.push({ x: centre.x, y: centre.y + ringDef.radius * 0.4, z: centre.z, text: `+${100 + accuracy}`, born: flight.elapsed });
      flight.ringIndex += 1;
      events |= EVENT_RING;
      if (flight.ringIndex >= mission.rings.length) {
        flight.finished = true;
        flight.outcome = 'complete';
        events |= EVENT_COMPLETE;
        setCallout(flight, 'COURSE CLEAR!', 'good');
      } else {
        setCallout(flight, 'RING CLEAR!', 'gold');
      }
    } else if (flight.missCooldown <= 0) {
      flight.missCooldown = 4;
      events |= EVENT_MISS;
      setCallout(flight, 'MISSED — CIRCLE BACK', 'warn');
    }
  }
  return events;
}

/** Fuel cans: fly through one to take on fuel and a few points. */
function judgePickups(flight, mission, events) {
  for (const pickup of flight.pickups) {
    if (pickup.taken) continue;
    const dx = flight.x - pickup.x;
    const dy = flight.y - pickup.y;
    const dz = flight.z - pickup.z;
    if (dx * dx + dy * dy + dz * dz < 18 * 18) {
      pickup.taken = true;
      flight.pickupsTaken += 1;
      flight.fuel = Math.min(flight.perf.fuelCap, flight.fuel + flight.perf.fuelCap * 0.28);
      flight.score += 25;
      flight.popups.push({ x: pickup.x, y: pickup.y + 6, z: pickup.z, text: '+FUEL', born: flight.elapsed });
      events |= EVENT_PICKUP;
      setCallout(flight, 'FUEL ABOARD', 'good');
    }
  }
  return events;
}

/** Terrain, water and lighthouse strikes: grazes dent, hard hits end the sortie. */
function judgeCollisions(flight, terrain, events) {
  const ground = terrain.heightAt(flight.x, flight.z);
  const descent = -forwardVector(flight.heading, flight.pitch).y * flight.speed;
  if (ground > 0.5 && flight.y < ground + 2.4) {
    const impact = descent + flight.speed * 0.12;
    if (impact > 24 || flight.speed > 88) {
      flight.finished = true;
      flight.outcome = 'crash';
      return events | EVENT_CRASH;
    }
    // Damage lands once per strike, not once per step spent sliding along the hill.
    if (flight.grazeCooldown <= 0) {
      flight.grazeCooldown = 0.8;
      flight.damage = Math.min(100, flight.damage + 10 + impact * 0.7);
      events |= EVENT_GRAZE;
      setCallout(flight, 'TERRAIN STRIKE!', 'danger');
    }
    flight.y = ground + 2.4;
    flight.pitch = Math.max(flight.pitch, 0.14);
    flight.speed *= 0.82;
  } else if (flight.y < 1.7) {
    flight.finished = true;
    flight.outcome = flight.speed < 34 ? 'ditch' : 'crash';
    return events | (flight.outcome === 'ditch' ? EVENT_DITCH : EVENT_CRASH);
  }
  const lh = terrain.lighthouse;
  const dx = flight.x - lh.x;
  const dz = flight.z - lh.z;
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  if (horizontal < lh.radius + 3 && flight.y < lh.base + lh.height) {
    flight.damage = Math.min(100, flight.damage + 22);
    const push = (lh.radius + 4) / Math.max(horizontal, 0.01);
    flight.x = lh.x + dx * push;
    flight.z = lh.z + dz * push;
    flight.speed *= 0.72;
    events |= EVENT_GRAZE;
    setCallout(flight, 'LIGHTHOUSE CLIP!', 'danger');
  }
  if (flight.damage >= 100) {
    flight.finished = true;
    flight.outcome = 'crash';
    events |= EVENT_CRASH;
  }
  return events;
}

/**
 * Advance the flight one fixed step. controls = {pitchIn, rollIn, throttleIn}
 * each in [-1, 1] (pitchIn + climbs, rollIn + banks right, throttleIn + opens
 * the throttle). Returns the event bitmask for this step.
 */
export function stepFlight(flight, mission, terrain, controls, dt) {
  if (flight.finished) return 0;
  let events = 0;
  flight.prevX = flight.x;
  flight.prevY = flight.y;
  flight.prevZ = flight.z;
  flight.elapsed += dt;
  flight.timeLeft -= dt;
  flight.missCooldown = Math.max(0, flight.missCooldown - dt);
  flight.grazeCooldown = Math.max(0, flight.grazeCooldown - dt);
  for (const ringDef of mission.rings) ringDef.flash = Math.max(0, ringDef.flash - dt * 0.8);
  flight.popups = flight.popups.filter((p) => flight.elapsed - p.born < 1.5);

  // Throttle and engine.
  flight.engineDead = flight.fuel <= 0;
  if (flight.engineDead) flight.throttle = Math.max(0, flight.throttle - dt * 1.5);
  else flight.throttle = clamp(flight.throttle + controls.throttleIn * 0.55 * dt, 0, 1);
  flight.fuel = Math.max(0, flight.fuel - (0.16 + flight.throttle * 0.58) * mission.fuelRate * dt);

  // Speed: chase the throttle's target, gravity trades height for speed.
  const targetSpeed = flight.engineDead
    ? flight.perf.minSpeed * 0.7
    : flight.perf.minSpeed + flight.throttle * (flight.perf.maxSpeed - flight.perf.minSpeed);
  flight.speed += (targetSpeed - flight.speed) * Math.min(1, dt * 0.5);
  flight.speed += -Math.sin(flight.pitch) * 6.5 * dt;
  flight.speed = clamp(flight.speed, 11, flight.perf.maxSpeed * 1.3);

  // Stall: below stall speed the nose drops and the controls go mushy.
  const wasStalled = flight.stalled;
  flight.stalled = flight.speed < flight.perf.stallSpeed;
  if (flight.stalled && !wasStalled) events |= EVENT_STALL;
  const authority = clamp(flight.speed / 52, 0.3, 1) * (flight.stalled ? 0.4 : 1);

  // Pitch and bank.
  if (flight.stalled) flight.pitch += (-0.38 - flight.pitch) * Math.min(1, dt * 1.6);
  else flight.pitch += controls.pitchIn * 0.9 * authority * dt;
  if (controls.pitchIn === 0 && !flight.stalled) flight.pitch -= flight.pitch * 0.1 * dt;
  flight.pitch = clamp(flight.pitch, -1.05, 1.05);
  if (controls.rollIn !== 0) flight.roll += controls.rollIn * 2.3 * authority * dt;
  else flight.roll -= flight.roll * 1.7 * dt;
  flight.roll = clamp(flight.roll, -1.15, 1.15);

  // Coordinated turn from bank; wind drifts the ground track.
  const turnRate = clamp((Math.tan(flight.roll) * 9.8) / Math.max(flight.speed, 24), -0.55, 0.55) * flight.perf.turn;
  flight.heading = wrapAngle(flight.heading + turnRate * dt);
  const forward = forwardVector(flight.heading, flight.pitch);
  const wind = windVector(mission);
  flight.x += (forward.x * flight.speed + wind.x) * dt;
  flight.y += forward.y * flight.speed * dt;
  flight.z += (forward.z * flight.speed + wind.z) * dt;
  flight.x = clamp(flight.x, -WORLD.half + 40, WORLD.half - 40);
  flight.z = clamp(flight.z, -WORLD.half + 40, WORLD.half - 40);
  if (flight.y > WORLD.ceiling) {
    flight.y = WORLD.ceiling;
    flight.pitch = Math.min(flight.pitch, 0);
  }

  events = judgeRing(flight, mission, events);
  events = judgePickups(flight, mission, events);
  events = judgeCollisions(flight, terrain, events);
  if (!flight.finished && flight.timeLeft <= 0) {
    flight.finished = true;
    flight.outcome = 'timeout';
    events |= EVENT_TIMEOUT;
  }
  return events;
}

/** Attach the mission's fuel cans to a fresh flight (mutable taken flags). */
export function armPickups(flight, mission) {
  flight.pickups = mission.pickups.map(([x, y, z]) => ({ x, y, z, taken: false }));
}

/**
 * The debrief ledger for a finished (or failed) sortie: ring points, accuracy,
 * time and fuel bonuses, damage penalty, total and scrip earned.
 */
export function sortieLedger(flight, mission) {
  const complete = flight.outcome === 'complete';
  const timeBonus = complete ? Math.max(0, Math.round((mission.par - flight.elapsed) * 4)) + Math.round(Math.max(0, flight.timeLeft) * 2) : 0;
  const fuelBonus = complete ? Math.round(flight.fuel * 2) : 0;
  const damagePenalty = Math.round(flight.damage * 3);
  const total = Math.max(0, flight.ringPoints + flight.accuracyPoints + flight.pickupsTaken * 25 + timeBonus + fuelBonus - damagePenalty);
  return {
    complete,
    ringPoints: flight.ringPoints,
    accuracyPoints: flight.accuracyPoints,
    pickupPoints: flight.pickupsTaken * 25,
    timeBonus,
    fuelBonus,
    damagePenalty,
    total,
    scrip: complete ? Math.round(total / 10) : flight.ringsPassed * 15,
  };
}
