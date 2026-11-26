// Boot and the one loop: input is read every frame, the flight advances in
// fixed 1/60 s steps, the renderer paints the world and the HUD paints the
// instruments over it. Screens: briefing (sortie + aircraft choice) → hangar
// (upgrades) → play → paused → debrief (graded ledger) → next sortie.
//
// ?seed=N fixes the archipelago dressing. ?shot=cover|start|hangar|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { AIRCRAFT, SAVE_KEY, STEP, UPGRADES } from './config.js';
import { createTerrain } from './terrain.js';
import { MISSIONS, gradeSortie } from './missions.js';
import {
  EVENT_COMPLETE, EVENT_CRASH, EVENT_DITCH, EVENT_GRAZE, EVENT_MISS,
  EVENT_PICKUP, EVENT_RING, armPickups, createFlight, sortieLedger, stepFlight,
} from './flight-model.js';
import { buildAircraftModel } from './aircraft-model.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer } from './render.js';
import { SCREEN_BRIEFING, SCREEN_DEBRIEF, SCREEN_HANGAR, SCREEN_PAUSED, SCREEN_PLAY, createHud } from './hud.js';
import {
  ACTION_BACK, ACTION_CONFIRM, ACTION_HANGAR, ACTION_LEFT, ACTION_MUTE,
  ACTION_NEXT, ACTION_PAUSE, ACTION_RESTART, ACTION_RIGHT, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { autopilotControls, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud();
const audio = createAudio();

function defaultSave() {
  return { scrip: 0, upgrades: { engine: 0, tank: 0, handling: 0 }, aircraft: 0, best: {}, muted: false };
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const save = defaultSave();
    if (Number.isFinite(parsed.scrip)) save.scrip = parsed.scrip;
    for (const track of UPGRADES) {
      const level = parsed.upgrades?.[track.id];
      if (Number.isInteger(level)) save.upgrades[track.id] = Math.max(0, Math.min(4, level));
    }
    if (Number.isInteger(parsed.aircraft)) save.aircraft = Math.max(0, Math.min(AIRCRAFT.length - 1, parsed.aircraft));
    if (parsed.best && typeof parsed.best === 'object') save.best = parsed.best;
    save.muted = parsed.muted === true;
    return save;
  } catch {
    return defaultSave();
  }
}

function storeSave(game) {
  if (game.shotMode) return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function announce(message) {
  statusEl.textContent = message;
}

/** The whole game state. Render and HUD read from this one object. */
function createGame() {
  const game = {
    terrain: createTerrain(seed),
    save: loadSave(),
    screen: SCREEN_BRIEFING,
    selectedSortie: 0,
    missionIndex: 0,
    mission: MISSIONS[0],
    flight: null,
    camera: null,
    model: null,
    ledger: null,
    gradeInfo: null,
    message: '',
    shotMode: Boolean(shot),
  };
  game.model = buildAircraftModel(game.save.aircraft);
  return game;
}

/** Start (or restart) a sortie: fresh flight, armed fuel cans, reset camera. */
function startSortie(game, missionIndex, screen) {
  game.missionIndex = missionIndex;
  game.mission = MISSIONS[missionIndex];
  for (const ringDef of game.mission.rings) ringDef.flash = 0;
  game.model = buildAircraftModel(game.save.aircraft);
  game.flight = createFlight(game.mission, game.save.aircraft, game.save.upgrades);
  armPickups(game.flight, game.mission);
  game.camera = createCamera(game.flight);
  game.ledger = null;
  game.gradeInfo = null;
  game.screen = screen;
}

/** Grade the finished sortie, bank the scrip, record the best, show the debrief. */
function finishSortie(game) {
  const { flight, mission, missionIndex } = game;
  game.ledger = sortieLedger(flight, mission);
  game.gradeInfo = gradeSortie(mission, {
    complete: game.ledger.complete,
    ringsPassed: flight.ringsPassed,
    elapsed: flight.elapsed,
    damage: flight.damage,
  });
  game.save.scrip += game.ledger.scrip;
  if (game.ledger.complete) {
    const previous = game.save.best[missionIndex];
    if (!previous || game.ledger.total > previous.score) {
      game.save.best[missionIndex] = { score: game.ledger.total, grade: game.gradeInfo.grade, stars: game.gradeInfo.stars };
    }
  }
  storeSave(game);
  game.screen = SCREEN_DEBRIEF;
  announce(game.ledger.complete
    ? `Sortie complete. Grade ${game.gradeInfo.grade}. Score ${game.ledger.total}.`
    : `Sortie lost. Score ${game.ledger.total}.`);
}

/** Advance one fixed step: flight, camera, sounds, and the finish handoff. */
function stepSim(game, controls) {
  const events = stepFlight(game.flight, game.mission, game.terrain, controls, STEP);
  updateCamera(game.camera, game.flight, game.terrain, STEP);
  if (!game.shotMode) {
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISS) audio.miss();
    if (events & EVENT_GRAZE) audio.graze();
    if (events & (EVENT_CRASH | EVENT_DITCH)) audio.crash();
    if (events & EVENT_COMPLETE) audio.complete();
    if (events & EVENT_RING) announce(`Ring ${game.flight.ringsPassed} of ${game.mission.rings.length}.`);
  }
  if (game.flight.finished && game.screen === SCREEN_PLAY) finishSortie(game);
  return events;
}

function setAircraft(game, index) {
  game.save.aircraft = index;
  game.model = buildAircraftModel(index);
  storeSave(game);
  if (game.screen === SCREEN_BRIEFING || game.screen === SCREEN_HANGAR) {
    startSortie(game, game.selectedSortie, game.screen);
  }
}

function buyUpgrade(game, trackId) {
  const track = UPGRADES.find((t) => t.id === trackId);
  const level = game.save.upgrades[trackId];
  if (!track || level >= 4) return;
  const price = track.prices[level];
  if (game.save.scrip < price) {
    game.message = `Not enough scrip for ${track.name} MK ${['I', 'II', 'III', 'IV'][level]} — fly a sortie.`;
    return;
  }
  game.save.scrip -= price;
  game.save.upgrades[trackId] = level + 1;
  game.message = `${track.name} MK ${['I', 'II', 'III', 'IV'][level]} fitted.`;
  storeSave(game);
  audio.click();
}

function handleButton(game, id) {
  if (!id) return false;
  const [kind, value] = id.split(':');
  if (kind === 'sortie') {
    game.selectedSortie = Number(value);
    startSortie(game, game.selectedSortie, SCREEN_BRIEFING);
  } else if (kind === 'aircraft') {
    setAircraft(game, Number(value));
  } else if (kind === 'buy') {
    buyUpgrade(game, value);
  } else if (id === 'fly') {
    startSortie(game, game.selectedSortie, SCREEN_PLAY);
    announce(`Flying ${game.mission.name}. Thread ${game.mission.rings.length} rings.`);
  } else if (id === 'hangar') {
    game.screen = SCREEN_HANGAR;
    game.message = '';
  } else if (id === 'briefing') {
    game.screen = SCREEN_BRIEFING;
  } else if (id === 'next') {
    game.selectedSortie = Math.min(MISSIONS.length - 1, game.missionIndex + 1);
    startSortie(game, game.selectedSortie, SCREEN_PLAY);
  } else if (id === 'retry') {
    startSortie(game, game.missionIndex, SCREEN_PLAY);
  } else {
    return false;
  }
  audio.click();
  return true;
}

function handleActions(game, input) {
  const click = input.takeClick();
  let clickHandled = false;
  if (click && game.screen !== SCREEN_PLAY && game.screen !== SCREEN_PAUSED) {
    clickHandled = handleButton(game, hud.hitTest(click.x, click.y));
  }
  let actions = input.takeActions();
  if (clickHandled) actions &= ~ACTION_CONFIRM; // the click that pressed a button must not also "confirm"
  const digit = input.takeDigit();
  if (actions & ACTION_MUTE) {
    game.save.muted = !game.save.muted;
    audio.setMuted(game.save.muted);
    storeSave(game);
  }
  if (game.screen === SCREEN_BRIEFING) {
    if (digit >= 1 && digit <= MISSIONS.length) {
      game.selectedSortie = digit - 1;
      startSortie(game, game.selectedSortie, SCREEN_BRIEFING);
    } else if (actions & ACTION_LEFT) setAircraft(game, (game.save.aircraft + AIRCRAFT.length - 1) % AIRCRAFT.length);
    else if (actions & ACTION_RIGHT) setAircraft(game, (game.save.aircraft + 1) % AIRCRAFT.length);
    else if (actions & ACTION_HANGAR) { game.screen = SCREEN_HANGAR; game.message = ''; }
    else if (actions & ACTION_CONFIRM) {
      startSortie(game, game.selectedSortie, SCREEN_PLAY);
      announce(`Flying ${game.mission.name}. Thread ${game.mission.rings.length} rings.`);
    }
  } else if (game.screen === SCREEN_HANGAR) {
    if (actions & (ACTION_BACK | ACTION_HANGAR)) game.screen = SCREEN_BRIEFING;
    else if (actions & ACTION_LEFT) setAircraft(game, (game.save.aircraft + AIRCRAFT.length - 1) % AIRCRAFT.length);
    else if (actions & ACTION_RIGHT) setAircraft(game, (game.save.aircraft + 1) % AIRCRAFT.length);
  } else if (game.screen === SCREEN_PLAY) {
    if (actions & (ACTION_PAUSE | ACTION_BACK)) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  } else if (game.screen === SCREEN_PAUSED) {
    if (actions & (ACTION_PAUSE | ACTION_BACK | ACTION_CONFIRM)) {
      game.screen = SCREEN_PLAY;
      announce('Flying.');
    } else if (actions & ACTION_RESTART) startSortie(game, game.missionIndex, SCREEN_PLAY);
  } else if (game.screen === SCREEN_DEBRIEF) {
    if (actions & ACTION_NEXT && game.ledger?.complete && game.missionIndex < MISSIONS.length - 1) {
      game.selectedSortie = game.missionIndex + 1;
      startSortie(game, game.selectedSortie, SCREEN_PLAY);
    } else if (actions & ACTION_RESTART) startSortie(game, game.missionIndex, SCREEN_PLAY);
    else if (actions & ACTION_HANGAR) { game.screen = SCREEN_HANGAR; game.message = ''; }
    else if (actions & ACTION_BACK) game.screen = SCREEN_BRIEFING;
    else if (actions & ACTION_CONFIRM) startSortie(game, game.missionIndex, SCREEN_PLAY);
  }
}

function runShot(name) {
  const game = createGame();
  game.shotMode = true;
  const rig = {
    game,
    startSortie: (index, screen) => startSortie(game, index, screen),
    stepSim: (controls) => stepSim(game, controls),
  };
  stageShot(name, rig);
  let painted = 0;
  function paint() {
    renderer.drawWorld(game, STEP);
    hud.draw(renderer.ctx, renderer.size(), game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const game = createGame();
  const input = createInput(canvas);
  audio.setMuted(game.save.muted);
  startSortie(game, 0, SCREEN_BRIEFING);
  let accumulator = 0;
  let last = performance.now();

  window.addEventListener('pointerdown', () => audio.init(), { once: false });
  window.addEventListener('keydown', () => audio.init(), { once: false });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions(game, input);
    const flying = game.screen === SCREEN_PLAY || game.screen === SCREEN_BRIEFING || game.screen === SCREEN_HANGAR;
    if (flying) {
      while (accumulator >= STEP) {
        if (game.screen === SCREEN_PLAY) {
          stepSim(game, input.controls());
        } else {
          // Menu backdrop: the autopilot flies the selected sortie behind the paper.
          stepSim(game, autopilotControls(game.flight, game.mission, game.terrain));
          if (game.flight.finished) startSortie(game, game.selectedSortie, game.screen);
        }
        accumulator -= STEP;
        if (game.screen === SCREEN_DEBRIEF || game.screen === SCREEN_PAUSED) break;
      }
    } else {
      accumulator = 0;
    }
    if (game.screen === SCREEN_PLAY) audio.update(game.flight);
    renderer.drawWorld(game, STEP);
    hud.draw(renderer.ctx, renderer.size(), game);
  }

  announce('Skydrift Rings. Choose a sortie and press Enter to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
