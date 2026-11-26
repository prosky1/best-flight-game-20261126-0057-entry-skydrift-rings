// Input: keyboard and mouse, both always live. Held keys and the pointer's
// offset from screen centre combine into the three flight controls (pitch,
// bank, throttle); the wheel trims throttle in notches. One-shot actions
// (confirm, pause, restart, hangar, mute, sortie digits) queue as a bitmask
// the main loop drains once per frame, and clicks are reported in canvas
// pixels for the HUD's buttons.

/** One-shot action bits returned by takeActions(). */
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_NEXT = 8;
export const ACTION_HANGAR = 16;
export const ACTION_MUTE = 32;
export const ACTION_BACK = 64;
export const ACTION_LEFT = 128;
export const ACTION_RIGHT = 256;
export const ACTION_UP = 512;
export const ACTION_DOWN = 1024;

const PITCH_UP = ['KeyW', 'ArrowUp'];
const PITCH_DOWN = ['KeyS', 'ArrowDown'];
const BANK_LEFT = ['KeyA', 'ArrowLeft'];
const BANK_RIGHT = ['KeyD', 'ArrowRight'];
const THROTTLE_UP = ['ShiftLeft', 'ShiftRight', 'Equal'];
const THROTTLE_DOWN = ['ControlLeft', 'ControlRight', 'Minus'];

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let digit = 0;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let pointerSeen = false;
  let wheelImpulse = 0;
  let click = null;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      held.add(event.code);
      return;
    }
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP') actions |= ACTION_PAUSE;
    else if (event.code === 'Escape') actions |= ACTION_BACK;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'KeyN') actions |= ACTION_NEXT;
    else if (event.code === 'KeyH') actions |= ACTION_HANGAR;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'ArrowLeft') actions |= ACTION_LEFT;
    else if (event.code === 'ArrowRight') actions |= ACTION_RIGHT;
    else if (event.code === 'ArrowUp') actions |= ACTION_UP;
    else if (event.code === 'ArrowDown') actions |= ACTION_DOWN;
    else if (/^Digit[1-6]$/.test(event.code)) digit = Number(event.code.slice(5));
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointermove', (event) => {
    pointerX = event.clientX / Math.max(1, window.innerWidth);
    pointerY = event.clientY / Math.max(1, window.innerHeight);
    pointerSeen = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    click = {
      x: (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('wheel', (event) => {
    wheelImpulse += event.deltaY < 0 ? 0.6 : -0.6;
    event.preventDefault();
  }, { passive: false });

  function anyHeld(codes) {
    return codes.some((code) => held.has(code));
  }

  function deadzone(value) {
    return Math.abs(value) < 0.07 ? 0 : value;
  }

  /**
   * The three flight controls for one simulation step, each in [-1, 1]:
   * pitchIn + climbs, rollIn + banks right, throttleIn + opens the throttle.
   * Keys and mouse add together (clamped); the wheel's impulse decays per step.
   */
  function controls() {
    let pitchIn = (anyHeld(PITCH_UP) ? 1 : 0) - (anyHeld(PITCH_DOWN) ? 1 : 0);
    let rollIn = (anyHeld(BANK_RIGHT) ? 1 : 0) - (anyHeld(BANK_LEFT) ? 1 : 0);
    let throttleIn = (anyHeld(THROTTLE_UP) ? 1 : 0) - (anyHeld(THROTTLE_DOWN) ? 1 : 0);
    if (pointerSeen) {
      pitchIn += deadzone((0.5 - pointerY) * 2.2);
      rollIn += deadzone((pointerX - 0.5) * 2.2);
    }
    throttleIn += Math.max(-1, Math.min(1, wheelImpulse));
    wheelImpulse *= 0.82;
    if (Math.abs(wheelImpulse) < 0.02) wheelImpulse = 0;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    return { pitchIn: clamp(pitchIn), rollIn: clamp(rollIn), throttleIn: clamp(throttleIn) };
  }

  /** Drain the queued one-shot actions. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  /** Drain a sortie digit key (1-6), or 0. */
  function takeDigit() {
    const taken = digit;
    digit = 0;
    return taken;
  }

  /** Drain the last click in canvas pixels, or null. */
  function takeClick() {
    const taken = click;
    click = null;
    return taken;
  }

  return { controls, takeActions, takeDigit, takeClick };
}
