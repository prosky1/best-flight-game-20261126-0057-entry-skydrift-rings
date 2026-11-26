// Screenshot staging behind ?shot=cover|start|hangar|end. A seeded autopilot
// flies the real flight model — pure pursuit toward an approach point in
// front of each ring, terrain-aware, cruising at a steady speed — so every
// staged frame is what a real sortie looks like, and the same seed always
// gives the same frame. The cover is staged deep into the Grand Circuit,
// banked toward the next ring with the RING CLEAR callout still on screen.
import { STEP } from './config.js';
import { forwardVector, nextRingInfo, wrapAngle } from './flight-model.js';
import { windVector } from './missions.js';
import { SCREEN_BRIEFING, SCREEN_HANGAR, SCREEN_PLAY } from './hud.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * One step of autopilot controls. Guidance is a vector field around the
 * course axis through the next ring: aim at a point on the axis ahead of the
 * aircraft, pulled back toward the axis by half the current offset, so the
 * approach funnels onto the line and crosses the ring near its centre. A
 * crab angle into the wind keeps the ground track on the axis in crosswinds.
 */
export function autopilotControls(flight, mission, terrain) {
  const info = nextRingInfo(flight, mission);
  let aim;
  if (info) {
    const ringDef = mission.rings[flight.ringIndex];
    const relX = flight.x - info.centre.x;
    const relY = flight.y - info.centre.y;
    const relZ = flight.z - info.centre.z;
    const along = relX * ringDef.nx + relY * ringDef.ny + relZ * ringDef.nz;
    const crossX = relX - ringDef.nx * along;
    const crossY = relY - ringDef.ny * along;
    const crossZ = relZ - ringDef.nz * along;
    const crossDist = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
    if (along > 170) {
      // Past the ring without threading it: fly back out to a fresh approach
      // instead of orbiting the exit point.
      aim = {
        x: info.centre.x - ringDef.nx * 380,
        y: info.centre.y - ringDef.ny * 380,
        z: info.centre.z - ringDef.nz * 380,
      };
    } else {
      // Aim farther ahead the farther off-axis we are: a shallow funnel that
      // cannot settle into a tight orbit around the aim point.
      const aimAlong = clamp(along + 130 + crossDist * 0.7, -320, 170);
      aim = {
        x: info.centre.x + ringDef.nx * aimAlong - crossX * 0.5,
        y: info.centre.y + ringDef.ny * aimAlong - crossY * 0.5,
        z: info.centre.z + ringDef.nz * aimAlong - crossZ * 0.5,
      };
    }
  } else {
    aim = { x: flight.x, y: 150, z: flight.z - 600 };
  }
  const dx = aim.x - flight.x;
  const dy = aim.y - flight.y;
  const dz = aim.z - flight.z;
  const horiz = Math.max(1, Math.sqrt(dx * dx + dz * dz));
  // Crab into the wind: head off-track by asin(crosswind / airspeed) so the
  // ground track, not the nose, follows the aim line.
  const wind = windVector(mission);
  const trackX = dx / horiz;
  const trackZ = dz / horiz;
  const crosswind = wind.x * -trackZ + wind.z * trackX;
  const crab = Math.asin(clamp(crosswind / Math.max(flight.speed, 24), -0.6, 0.6));
  const desiredHeading = Math.atan2(dx, -dz) - crab;
  const headingErr = wrapAngle(desiredHeading - flight.heading);
  const rollIn = clamp(headingErr * 1.5 - flight.roll * 0.55, -1, 1);
  let desiredPitch = clamp(Math.atan2(dy, horiz), -0.45, 0.45);
  const clearance = flight.y - terrain.heightAt(flight.x, flight.z);
  if (clearance < 48) desiredPitch = Math.max(desiredPitch, 0.3);
  // Look ahead along the flight path: start the climb before the hill arrives.
  const forward = forwardVector(flight.heading, flight.pitch);
  const aheadClearance = flight.y - terrain.heightAt(flight.x + forward.x * 160, flight.z + forward.z * 160);
  if (aheadClearance < 40) desiredPitch = Math.max(desiredPitch, 0.34);
  if (flight.y < 32) desiredPitch = Math.max(desiredPitch, 0.35);
  const pitchIn = clamp((desiredPitch - flight.pitch) * 2.4, -1, 1);
  // Slow down to tighten the turn when the ring has ended up behind us.
  let cruise = 64 - Math.min(14, Math.abs(headingErr) * 18);
  if (info && Math.abs(headingErr) > 2.0 && info.distance < 300) cruise = 46;
  const throttleIn = clamp((cruise - flight.speed) * 0.09, -1, 1);
  return { pitchIn, rollIn, throttleIn };
}

/** Fly the autopilot for a fixed number of seconds (or until the sortie ends). */
function flySeconds(rig, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps && !rig.game.flight.finished; i += 1) {
    rig.stepSim(autopilotControls(rig.game.flight, rig.game.mission, rig.game.terrain));
  }
}

/**
 * Set the game to the named scene. rig = {game, startSortie(index, screen),
 * stepSim(controls) -> events}. Mutates game (save, screen, flight) in place.
 */
export function stageShot(name, rig) {
  const { game } = rig;
  if (name === 'cover') {
    // Late Grand Circuit: the cream-and-red Skimmer (it reads against the
    // teal sea where the Dart's teal livery would vanish) with a couple of
    // marks fitted, banked on final approach deep into the course.
    game.save = {
      scrip: 640,
      upgrades: { engine: 2, tank: 1, handling: 1 },
      aircraft: 0,
      best: { 0: { score: 2140, grade: 'A', stars: [true, true, false] }, 4: { score: 3120, grade: 'B', stars: [true, false, false] }, 5: { score: 2915, grade: 'B', stars: [true, false, false] } },
      muted: false,
    };
    rig.startSortie(5, SCREEN_PLAY);
    const cap = Math.floor(600 / STEP);
    for (let i = 0; i < cap && !game.flight.finished; i += 1) {
      rig.stepSim(autopilotControls(game.flight, game.mission, game.terrain));
      const info = nextRingInfo(game.flight, game.mission);
      // Peak frame: deep into the course, in a graceful bank on final
      // approach under power, next ring large ahead, one beyond it visible.
      const bank = Math.abs(game.flight.roll);
      const peak = game.flight.ringsPassed >= 9
        && info && info.distance >= 170 && info.distance <= 300
        && bank >= 0.28 && bank <= 0.7
        && game.flight.throttle >= 0.25;
      if (peak) break;
    }
    game.screen = SCREEN_PLAY;
    return;
  }
  if (name === 'hangar') {
    game.save = {
      scrip: 1240,
      upgrades: { engine: 2, tank: 1, handling: 0 },
      aircraft: 1,
      best: { 0: { score: 2140, grade: 'A', stars: [true, true, false] }, 1: { score: 2680, grade: 'B', stars: [true, false, false] } },
      muted: false,
    };
    rig.startSortie(0, SCREEN_HANGAR);
    flySeconds(rig, 6);
    game.screen = SCREEN_HANGAR;
    return;
  }
  if (name === 'end') {
    // A clean Harbor Hop, flown to completion, debriefed.
    game.save = { scrip: 0, upgrades: { engine: 0, tank: 0, handling: 0 }, aircraft: 0, best: {}, muted: false };
    rig.startSortie(0, SCREEN_PLAY);
    flySeconds(rig, 420);
    return; // stepSim's finish handling sets the debrief screen
  }
  // Default: the briefing sheet over a gently flown Harbor Hop.
  game.save = { scrip: 0, upgrades: { engine: 0, tank: 0, handling: 0 }, aircraft: 0, best: {}, muted: false };
  game.selectedSortie = 0;
  rig.startSortie(0, SCREEN_BRIEFING);
  flySeconds(rig, 9);
  game.screen = SCREEN_BRIEFING;
}
