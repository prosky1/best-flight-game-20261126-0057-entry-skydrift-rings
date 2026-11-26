// The instrument panel and the paper screens: brass-rimmed gauges and tapes
// that look flown (speed and altitude tapes, a heading tape with a bearing
// bug, an artificial horizon), named fuel and airframe states, progress
// fractions and callouts in flight — and, on the ground, the briefing sheet,
// the hangar and the graded debrief. Everything reads from the one palette.
import { AIRCRAFT, PALETTE, UPGRADES } from './config.js';
import { damageState, fuelState, nextRingInfo, performance, wrapAngle } from './flight-model.js';
import { MISSIONS, formatClock } from './missions.js';

const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";
const MONO = "'Consolas', 'Menlo', monospace";

/** Screen ids shared with main.js. */
export const SCREEN_BRIEFING = 'briefing';
export const SCREEN_HANGAR = 'hangar';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DEBRIEF = 'debrief';

export function createHud() {
  let buttons = [];

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
  }

  function label(ctx, text, x, y, size, colour, align = 'left', font = FONT) {
    ctx.fillStyle = colour;
    ctx.font = `bold ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  function button(ctx, id, x, y, w, h, text, tone = 'normal') {
    buttons.push({ id, x, y, w, h });
    ctx.fillStyle = tone === 'go' ? 'rgba(201, 162, 39, 0.9)' : 'rgba(8, 32, 36, 0.9)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    label(ctx, text, x + w / 2, y + h / 2 + 6, 17, tone === 'go' ? '#14303a' : PALETTE.text, 'center');
  }

  function chip(ctx, x, y, keyText, actionText) {
    ctx.font = `bold 13px ${MONO}`;
    const kw = ctx.measureText(keyText).width + 14;
    ctx.font = `bold 13px ${FONT}`;
    const aw = ctx.measureText(actionText).width + 10;
    ctx.fillStyle = 'rgba(245, 234, 210, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, kw, 24, 4);
    ctx.fill();
    label(ctx, keyText, x + kw / 2, y + 17, 13, '#14303a', 'center', MONO);
    label(ctx, actionText, x + kw + 6, y + 17, 13, PALETTE.text);
    return kw + aw + 16;
  }

  /** A vertical scrolling tape (speed or altitude) with a digital readout box. */
  function drawTape(ctx, x, y, w, h, value, unit, windowSize, tickEvery, labelEvery, pxPerUnit, colour) {
    panel(ctx, x, y, w, h);
    const cy = y + h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, y + 3, w - 6, h - 6);
    ctx.clip();
    const firstTick = Math.floor((value - windowSize) / tickEvery) * tickEvery;
    for (let v = firstTick; v <= value + windowSize; v += tickEvery) {
      if (v < 0) continue;
      const ty = cy + (value - v) * pxPerUnit;
      const major = v % labelEvery === 0;
      ctx.strokeStyle = major ? PALETTE.text : PALETTE.textDim;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + w - (major ? 22 : 13), ty);
      ctx.lineTo(x + w - 5, ty);
      ctx.stroke();
      if (major) label(ctx, String(v), x + w - 26, ty + 5, 13, PALETTE.text, 'right', MONO);
    }
    ctx.restore();
    // Digital readout box at centre.
    ctx.fillStyle = '#0a242a';
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x + 4, cy - 15, w - 8, 30, 4);
    ctx.fill();
    ctx.stroke();
    label(ctx, String(Math.round(value)), x + w / 2 - 6, cy + 7, 19, colour, 'center', MONO);
    label(ctx, unit, x + w - 9, cy + 13, 8, PALETTE.textDim, 'right', MONO);
  }

  /** The heading tape across the top, with a gold bug on the next ring's bearing. */
  function drawHeadingTape(ctx, cx, y, w, headingDeg, bugDeg) {
    panel(ctx, cx - w / 2, y, w, 52);
    const pxPerDeg = w / 130;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w / 2 + 3, y + 3, w - 6, 46);
    ctx.clip();
    const names = { 0: 'N', 30: '03', 60: '06', 90: 'E', 120: '12', 150: '15', 180: 'S', 210: '21', 240: '24', 270: 'W', 300: '30', 330: '33' };
    for (let d = -70; d <= 70; d += 5) {
      const deg = ((Math.round(headingDeg / 5) * 5 + d) % 360 + 360) % 360;
      const tx = cx + (deg - headingDeg + 540) % 360 * 0 + d * pxPerDeg;
      const major = deg % 30 === 0;
      ctx.strokeStyle = major ? PALETTE.text : PALETTE.textDim;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(tx, y + (major ? 22 : 30));
      ctx.lineTo(tx, y + 44);
      ctx.stroke();
      if (major) label(ctx, names[deg] ?? '', tx, y + 18, 13, deg % 90 === 0 ? PALETTE.gold : PALETTE.text, 'center', MONO);
    }
    if (bugDeg !== null) {
      const bugOffset = wrapAngle((bugDeg - headingDeg) * Math.PI / 180) * 180 / Math.PI;
      if (Math.abs(bugOffset) <= 65) {
        const bx = cx + bugOffset * pxPerDeg;
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.moveTo(bx, y + 46);
        ctx.lineTo(bx - 6, y + 36);
        ctx.lineTo(bx + 6, y + 36);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    // Centre caret + digital heading.
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(cx, y + 50);
    ctx.lineTo(cx - 7, y + 38);
    ctx.lineTo(cx + 7, y + 38);
    ctx.closePath();
    ctx.fill();
    label(ctx, `${String(Math.round(((headingDeg % 360) + 360) % 360)).padStart(3, '0')}°`, cx, y + 16, 14, PALETTE.text, 'center', MONO);
  }

  /** Artificial horizon: sky/ground ball that rolls and pitches with the aircraft. */
  function drawAttitude(ctx, cx, cy, r, pitch, roll) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-roll);
    const pitchPx = pitch * r * 1.1;
    ctx.fillStyle = '#3f74b8';
    ctx.fillRect(-r * 1.6, -r * 1.6 + pitchPx, r * 3.2, r * 1.6);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r * 1.6, pitchPx, r * 3.2, r * 1.6);
    ctx.strokeStyle = 'rgba(245,234,210,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 1.6, pitchPx);
    ctx.lineTo(r * 1.6, pitchPx);
    ctx.stroke();
    for (const p of [-0.5, -0.25, 0.25, 0.5]) {
      const ly = pitchPx - p * r * 1.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, ly);
      ctx.lineTo(r * 0.35, ly);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed aircraft symbol.
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy);
    ctx.lineTo(cx - r * 0.18, cy);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx + r * 0.18, cy);
    ctx.lineTo(cx + r * 0.55, cy);
    ctx.stroke();
  }

  /** A horizontal meter with a named state at its right end. */
  function drawMeter(ctx, x, y, w, fraction, stateText, stateColour, title) {
    label(ctx, title, x, y - 4, 11, PALETTE.textDim);
    ctx.fillStyle = 'rgba(10, 36, 42, 0.9)';
    ctx.strokeStyle = PALETTE.panelEdgeDim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 14, 3);
    ctx.fill();
    ctx.stroke();
    const filled = Math.max(0, Math.min(1, fraction));
    ctx.fillStyle = stateColour;
    if (filled > 0) {
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, (w - 4) * filled, 10, 2);
      ctx.fill();
    }
    label(ctx, stateText, x + w + 8, y + 12, 13, stateColour, 'left', MONO);
  }

  function statusPill(ctx, cx, y, text, colour) {
    ctx.font = `bold 14px ${FONT}`;
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(8, 32, 36, 0.88)';
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y, w, 28, 14);
    ctx.fill();
    ctx.stroke();
    label(ctx, text, cx, y + 19, 14, colour, 'center');
  }

  function drawFlightHud(ctx, size, game) {
    const { flight, mission, missionIndex, save } = game;
    const W = size.width;
    const H = size.height;
    const speedKmh = flight.speed * 3.6;
    const headingDeg = ((flight.heading * 180 / Math.PI) % 360 + 360) % 360;
    const info = nextRingInfo(flight, mission);
    const fuelFraction = flight.fuel / flight.perf.fuelCap;
    const fState = fuelState(fuelFraction);
    const dState = damageState(flight.damage);
    const best = save.best[missionIndex]?.score ?? 0;

    // Top-left: sortie identity + progress fractions.
    panel(ctx, 14, 12, 300, 86);
    label(ctx, `SORTIE ${missionIndex + 1}/${MISSIONS.length} · ${mission.name}`, 26, 38, 17, PALETTE.text);
    label(ctx, `${mission.type} · RING ${Math.min(flight.ringIndex + 1, mission.rings.length)}/${mission.rings.length}`, 26, 60, 14, PALETTE.gold, 'left', MONO);
    label(ctx, `SCORE ${flight.score.toLocaleString('en-US')} · BEST ${best.toLocaleString('en-US')}`, 26, 82, 13, PALETTE.textDim, 'left', MONO);

    // Top-right: clock vs par.
    panel(ctx, W - 314, 12, 300, 86);
    const timeColour = flight.timeLeft < 20 ? PALETTE.danger : flight.timeLeft < 45 ? PALETTE.warn : PALETTE.text;
    label(ctx, `TIME ${formatClock(flight.timeLeft)}`, W - 302, 40, 20, timeColour, 'left', MONO);
    label(ctx, `PAR ${formatClock(mission.par)} · ELAPSED ${formatClock(flight.elapsed)}`, W - 302, 62, 13, PALETTE.textDim, 'left', MONO);
    const windKt = Math.round(mission.wind.speed * 1.944);
    label(ctx, `WIND ${windKt} KT`, W - 302, 82, 13, PALETTE.textDim, 'left', MONO);
    // Wind arrow, relative to heading.
    const windRel = wrapAngle(mission.wind.dir - flight.heading);
    const wx = W - 60;
    const wy = 70;
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx - Math.sin(windRel) * 12, wy + Math.cos(windRel) * 12);
    ctx.lineTo(wx + Math.sin(windRel) * 12, wy - Math.cos(windRel) * 12);
    ctx.stroke();
    ctx.fillStyle = PALETTE.cyan;
    ctx.beginPath();
    ctx.arc(wx + Math.sin(windRel) * 12, wy - Math.cos(windRel) * 12, 3, 0, Math.PI * 2);
    ctx.fill();

    // Heading tape, top centre, gold bug on the next ring.
    const bugDeg = info ? ((info.bearingError + flight.heading) * 180 / Math.PI % 360 + 360) % 360 : null;
    drawHeadingTape(ctx, W / 2, 12, 430, headingDeg, bugDeg);

    // Next-ring arrow + distance under the tape.
    if (info) {
      const ax = W / 2;
      const ay = 104;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.max(-1.9, Math.min(1.9, info.bearingError)));
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(9, 8);
      ctx.lineTo(0, 3);
      ctx.lineTo(-9, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      label(ctx, `RING ${flight.ringIndex + 1} · ${Math.round(info.distance)} M`, ax, ay + 34, 14, PALETTE.gold, 'center', MONO);
    }

    // Left: speed tape + attitude. Right: altitude tape.
    drawTape(ctx, 14, H * 0.27, 96, H * 0.36, speedKmh, 'KM/H', 110, 20, 40, 1.05, PALETTE.text);
    drawAttitude(ctx, 62, H * 0.27 + H * 0.36 + 56, 50, flight.pitch, flight.roll);
    drawTape(ctx, W - 110, H * 0.27, 96, H * 0.36, flight.y, 'ALT M', 170, 20, 50, 0.62, PALETTE.text);

    // Right stack: throttle, fuel, airframe.
    const rx = W - 262;
    const ry = H * 0.27 + H * 0.36 + 22;
    panel(ctx, rx - 12, ry - 22, 248, 118);
    drawMeter(ctx, rx, ry, 150, flight.throttle, `${Math.round(flight.throttle * 100)}%`, PALETTE.cyan, 'THROTTLE');
    const fuelColour = fState === 'FULL' ? PALETTE.good : fState === 'LOW' ? PALETTE.warn : PALETTE.danger;
    drawMeter(ctx, rx, ry + 38, 150, fuelFraction, fState, fuelColour, 'FUEL');
    const dmgColour = dState === 'SOUND' ? PALETTE.good : dState === 'DENTED' ? PALETTE.warn : PALETTE.danger;
    drawMeter(ctx, rx, ry + 76, 150, 1 - flight.damage / 100, dState, dmgColour, 'AIRFRAME');

    // Left objectives checklist.
    const oy = H * 0.27 + H * 0.36 + 122;
    panel(ctx, 14, oy, 300, 86);
    label(ctx, 'OBJECTIVES', 26, oy + 24, 13, PALETTE.textDim);
    const objectives = [
      { text: `Thread ${mission.rings.length} rings (${flight.ringsPassed})`, done: flight.ringsPassed >= mission.rings.length },
      { text: `Finish under par ${formatClock(mission.par)}`, done: flight.elapsed <= mission.par },
      { text: 'No damage', done: flight.damage <= 0 },
    ];
    objectives.forEach((objective, i) => {
      const yy = oy + 46 + i * 18;
      label(ctx, objective.done ? '✓' : '○', 26, yy, 13, objective.done ? PALETTE.good : PALETTE.textDim, 'left', MONO);
      label(ctx, objective.text, 44, yy, 13, objective.done ? PALETTE.text : PALETTE.textDim);
    });

    // Status pill, bottom centre.
    let status = 'ON COURSE';
    let statusColour = PALETTE.good;
    if (flight.stalled) { status = 'STALL — NOSE DOWN'; statusColour = PALETTE.danger; }
    else if (flight.engineDead) { status = 'ENGINE DEAD — GLIDE'; statusColour = PALETTE.danger; }
    else if (fState === 'BINGO') { status = 'BINGO FUEL'; statusColour = PALETTE.danger; }
    else if (fState === 'RESERVE') { status = 'FUEL RESERVE'; statusColour = PALETTE.warn; }
    else if (info && Math.abs(info.bearingError) > 0.5) { status = `TURNING TO RING ${flight.ringIndex + 1}`; statusColour = PALETTE.gold; }
    else if (flight.pitch > 0.25) status = 'CLIMBING';
    else if (flight.pitch < -0.25) status = 'DIVING';
    statusPill(ctx, W / 2, H - 92, status, statusColour);

    // Callout: the big centre-screen event text.
    if (flight.callout) {
      const age = flight.elapsed - flight.callout.born;
      if (age < 1.7) {
        const alpha = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.9) / 0.8);
        const colour = flight.callout.tone === 'danger' ? PALETTE.danger : flight.callout.tone === 'warn' ? PALETTE.warn : flight.callout.tone === 'good' ? PALETTE.good : PALETTE.gold;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(H * 0.062)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(8, 32, 36, 0.85)';
        ctx.strokeText(flight.callout.text, W / 2, H * 0.34);
        ctx.fillStyle = colour;
        ctx.fillText(flight.callout.text, W / 2, H * 0.34);
        ctx.restore();
      }
    }

    // Bottom control chips.
    let cx = 14;
    const cy = H - 38;
    cx += chip(ctx, cx, cy, 'W/S', 'PITCH');
    cx += chip(ctx, cx, cy, 'A/D', 'BANK');
    cx += chip(ctx, cx, cy, 'SHIFT/CTRL', 'THROTTLE');
    cx += chip(ctx, cx, cy, 'MOUSE', 'STEER');
    cx += chip(ctx, cx, cy, 'P', 'PAUSE');
    chip(ctx, cx, cy, 'M', 'SOUND');
  }

  function starRow(ctx, x, y, stars, size, spacing = size * 2.4) {
    stars.forEach((filled, i) => {
      const sx = x + i * spacing;
      ctx.fillStyle = filled ? PALETTE.gold : 'rgba(245, 234, 210, 0.25)';
      ctx.beginPath();
      for (let k = 0; k < 10; k += 1) {
        const angle = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 === 0 ? size : size * 0.45;
        const px = sx + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawBriefing(ctx, size, game) {
    const W = size.width;
    const H = size.height;
    const { save, selectedSortie } = game;
    ctx.fillStyle = 'rgba(6, 20, 28, 0.55)';
    ctx.fillRect(0, 0, W, H);
    // Title block.
    ctx.save();
    ctx.letterSpacing = '6px';
    label(ctx, 'SKYDRIFT RINGS', W / 2, 92, 64, PALETTE.gold, 'center');
    ctx.restore();
    label(ctx, 'Thread glowing rings over a dusk archipelago — against the clock, on dwindling fuel.', W / 2, 126, 19, PALETTE.text, 'center');
    label(ctx, '6 SORTIES · 3 AIRCRAFT · 12 UPGRADES · FUEL, DAMAGE & CROSSWINDS', W / 2, 152, 15, PALETTE.cyan, 'center', MONO);
    label(ctx, 'GOAL: thread every ring in order before the clock dies · WIN: finish under par · LOSE: crash, ditch, or run dry', W / 2, 178, 14, PALETTE.textDim, 'center');

    // Sortie list, left.
    const lx = 40;
    const ly = 206;
    const lw = W * 0.52;
    panel(ctx, lx, ly, lw, 356);
    label(ctx, 'SORTIES — CLICK OR 1-6 TO SELECT', lx + 16, ly + 30, 14, PALETTE.textDim);
    MISSIONS.forEach((mission, i) => {
      const ry = ly + 44 + i * 49;
      const selected = i === selectedSortie;
      buttons.push({ id: `sortie:${i}`, x: lx + 10, y: ry, w: lw - 20, h: 44 });
      ctx.fillStyle = selected ? 'rgba(201, 162, 39, 0.28)' : 'rgba(10, 36, 42, 0.5)';
      ctx.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdgeDim;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(lx + 10, ry, lw - 20, 44, 5);
      ctx.fill();
      ctx.stroke();
      label(ctx, `${i + 1}. ${mission.name}`, lx + 22, ry + 21, 17, selected ? PALETTE.gold : PALETTE.text);
      label(ctx, `${mission.type} · ${mission.rings.length} RINGS · PAR ${formatClock(mission.par)}`, lx + 22, ry + 39, 12, PALETTE.textDim, 'left', MONO);
      const best = save.best[i];
      if (best) {
        label(ctx, `BEST ${best.score.toLocaleString('en-US')} · ${best.grade}`, lx + lw - 22, ry + 21, 13, PALETTE.cyan, 'right', MONO);
        starRow(ctx, lx + lw - 96, ry + 34, best.stars, 7);
      }
    });
    label(ctx, MISSIONS[selectedSortie].brief, lx + 16, ly + 350, 13, PALETTE.textDim);

    // Aircraft cards, right.
    const rx = lx + lw + 24;
    const rw = W - rx - 40;
    panel(ctx, rx, ly, rw, 356);
    label(ctx, 'AIRCRAFT — CLICK OR ←/→', rx + 16, ly + 30, 14, PALETTE.textDim);
    AIRCRAFT.forEach((plane, i) => {
      const ry = ly + 44 + i * 104;
      const selected = i === save.aircraft;
      buttons.push({ id: `aircraft:${i}`, x: rx + 10, y: ry, w: rw - 20, h: 96 });
      ctx.fillStyle = selected ? 'rgba(201, 162, 39, 0.28)' : 'rgba(10, 36, 42, 0.5)';
      ctx.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdgeDim;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(rx + 10, ry, rw - 20, 96, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = plane.colors.accent;
      ctx.fillRect(rx + 22, ry + 12, 16, 16);
      label(ctx, plane.name, rx + 46, ry + 27, 18, selected ? PALETTE.gold : PALETTE.text);
      label(ctx, plane.tagline, rx + 22, ry + 48, 12, PALETTE.textDim);
      const perf = performance(i, save.upgrades);
      const bars = [
        ['SPD', perf.maxSpeed / 140],
        ['TURN', perf.turn / 1.6],
        ['FUEL', perf.fuelCap / 150],
      ];
      bars.forEach(([name, frac], b) => {
        const by = ry + 58 + b * 12;
        label(ctx, name, rx + 22, by + 8, 10, PALETTE.textDim, 'left', MONO);
        ctx.fillStyle = 'rgba(10, 36, 42, 0.9)';
        ctx.fillRect(rx + 62, by, rw - 110, 8);
        ctx.fillStyle = PALETTE.cyan;
        ctx.fillRect(rx + 62, by, (rw - 110) * Math.min(1, frac), 8);
      });
    });

    // Bottom: controls + actions.
    const by = ly + 372;
    panel(ctx, lx, by, W - 80, 108);
    label(ctx, 'HOW TO FLY', lx + 16, by + 28, 14, PALETTE.textDim);
    let cx = lx + 16;
    const cy = by + 38;
    cx += chip(ctx, cx, cy, 'W/S ↑/↓', 'PITCH');
    cx += chip(ctx, cx, cy, 'A/D ←/→', 'BANK & TURN');
    cx += chip(ctx, cx, cy, 'SHIFT/CTRL', 'THROTTLE');
    cx += chip(ctx, cx, cy, 'MOUSE + WHEEL', 'STEER & THROTTLE');
    cx += chip(ctx, cx, cy, 'P', 'PAUSE');
    label(ctx, `SCRIP ${save.scrip.toLocaleString('en-US')}`, lx + 16, by + 92, 15, PALETTE.gold, 'left', MONO);
    button(ctx, 'hangar', W - 470, by + 64, 170, 40, 'HANGAR (H)');
    button(ctx, 'fly', W - 280, by + 64, 220, 40, 'FLY SORTIE ⏎', 'go');
  }

  function drawHangar(ctx, size, game) {
    const W = size.width;
    const H = size.height;
    const { save } = game;
    ctx.fillStyle = 'rgba(6, 20, 28, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.letterSpacing = '5px';
    label(ctx, 'HANGAR', W / 2, 84, 52, PALETTE.gold, 'center');
    ctx.restore();
    label(ctx, `SCRIP ${save.scrip.toLocaleString('en-US')} — earned by flying sorties, spent here`, W / 2, 116, 16, PALETTE.text, 'center', MONO);
    if (game.message) label(ctx, game.message, W / 2, 142, 15, PALETTE.warn, 'center');

    // Upgrade tracks.
    const tw = (W - 120) / 3;
    UPGRADES.forEach((track, ti) => {
      const tx = 40 + ti * (tw + 20);
      const ty = 166;
      panel(ctx, tx, ty, tw, 300);
      label(ctx, track.name, tx + 16, ty + 34, 20, PALETTE.text);
      label(ctx, track.desc, tx + 16, ty + 58, 13, PALETTE.textDim);
      const owned = save.upgrades[track.id];
      for (let level = 0; level < 4; level += 1) {
        const ry = ty + 76 + level * 54;
        const has = level < owned;
        const next = level === owned;
        const price = track.prices[level];
        ctx.fillStyle = has ? 'rgba(141, 255, 154, 0.14)' : 'rgba(10, 36, 42, 0.5)';
        ctx.strokeStyle = has ? PALETTE.good : next ? PALETTE.gold : PALETTE.panelEdgeDim;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(tx + 12, ry, tw - 24, 46, 5);
        ctx.fill();
        ctx.stroke();
        label(ctx, `MK ${['I', 'II', 'III', 'IV'][level]}`, tx + 24, ry + 29, 16, has ? PALETTE.good : PALETTE.text, 'left', MONO);
        if (has) label(ctx, 'FITTED ✓', tx + tw - 24, ry + 29, 14, PALETTE.good, 'right', MONO);
        else if (next) {
          buttons.push({ id: `buy:${track.id}`, x: tx + tw - 134, y: ry + 6, w: 110, h: 34 });
          ctx.fillStyle = save.scrip >= price ? 'rgba(201, 162, 39, 0.9)' : 'rgba(90, 80, 60, 0.6)';
          ctx.beginPath();
          ctx.roundRect(tx + tw - 134, ry + 6, 110, 34, 5);
          ctx.fill();
          label(ctx, `BUY ${price}`, tx + tw - 79, ry + 29, 14, '#14303a', 'center', MONO);
        } else label(ctx, `${price}`, tx + tw - 24, ry + 29, 14, PALETTE.textDim, 'right', MONO);
      }
    });

    // Aircraft row.
    const ay = 486;
    const aw = (W - 120) / 3;
    AIRCRAFT.forEach((plane, i) => {
      const ax = 40 + i * (aw + 20);
      const selected = i === save.aircraft;
      buttons.push({ id: `aircraft:${i}`, x: ax, y: ay, w: aw, h: 118 });
      panel(ctx, ax, ay, aw, 118);
      if (selected) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.roundRect(ax, ay, aw, 118, 7);
        ctx.stroke();
      }
      ctx.fillStyle = plane.colors.accent;
      ctx.fillRect(ax + 16, ay + 14, 18, 18);
      label(ctx, plane.name, ax + 44, ay + 31, 19, selected ? PALETTE.gold : PALETTE.text);
      label(ctx, plane.tagline, ax + 16, ay + 56, 12, PALETTE.textDim);
      const perf = performance(i, save.upgrades);
      label(ctx, `TOP ${Math.round(perf.maxSpeed * 3.6)} KM/H · TANK ${Math.round(perf.fuelCap)} · TURN ×${perf.turn.toFixed(2)}`, ax + 16, ay + 80, 12, PALETTE.cyan, 'left', MONO);
      label(ctx, selected ? 'SELECTED ✓' : 'CLICK TO SELECT', ax + 16, ay + 102, 12, selected ? PALETTE.good : PALETTE.textDim, 'left', MONO);
    });

    button(ctx, 'briefing', W / 2 - 120, H - 66, 240, 42, '← BRIEFING (ESC)');
  }

  function drawDebrief(ctx, size, game) {
    const W = size.width;
    const H = size.height;
    const { flight, mission, missionIndex, ledger, gradeInfo } = game;
    ctx.fillStyle = 'rgba(6, 20, 28, 0.55)';
    ctx.fillRect(0, 0, W, H);
    const pw = 640;
    const ph = 540;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2 - 10;
    panel(ctx, px, py, pw, ph);
    ctx.save();
    ctx.letterSpacing = '4px';
    label(ctx, `DEBRIEF — ${mission.name}`, px + pw / 2, py + 52, 30, PALETTE.text, 'center');
    ctx.restore();
    const reasons = { complete: 'COURSE CLEAR', crash: 'CRASHED', ditch: 'DITCHED AT SEA', timeout: 'OUT OF TIME' };
    label(ctx, reasons[flight.outcome] ?? '', px + pw / 2, py + 80, 16, ledger.complete ? PALETTE.good : PALETTE.danger, 'center', MONO);

    // Grade stamp.
    const stampX = px + pw - 108;
    const stampY = py + 128;
    ctx.save();
    ctx.translate(stampX, stampY);
    ctx.rotate(-0.18);
    ctx.strokeStyle = ledger.complete ? PALETTE.gold : PALETTE.danger;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, ledger.complete ? gradeInfo.grade : '✕', 0, 24, 62, ledger.complete ? PALETTE.gold : PALETTE.danger, 'center');
    ctx.restore();

    // Ledger.
    const rows = [
      ['RINGS', `${flight.ringsPassed} × 100`, ledger.ringPoints],
      ['ACCURACY', 'centre bonuses', ledger.accuracyPoints],
      ['FUEL CANS', `${flight.pickupsTaken} collected`, ledger.pickupPoints],
      ['TIME BONUS', `par ${formatClock(mission.par)} · flew ${formatClock(flight.elapsed)}`, ledger.timeBonus],
      ['FUEL BONUS', `${Math.round(flight.fuel)} units left`, ledger.fuelBonus],
      ['DAMAGE', `${Math.round(flight.damage)}% airframe`, -ledger.damagePenalty],
    ];
    let ry = py + 122;
    for (const [name, note, value] of rows) {
      const clean = value === 0 ? 0 : value;
      label(ctx, name, px + 36, ry, 16, PALETTE.text);
      label(ctx, note, px + 200, ry, 12, PALETTE.textDim, 'left', MONO);
      label(ctx, clean < 0 ? `-${Math.abs(clean).toLocaleString('en-US')}` : `+${clean.toLocaleString('en-US')}`, px + pw - 180, ry, 16, clean < 0 ? PALETTE.danger : PALETTE.text, 'right', MONO);
      ry += 31;
    }
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px + 36, ry - 8);
    ctx.lineTo(px + pw - 180, ry - 8);
    ctx.stroke();
    label(ctx, 'TOTAL', px + 36, ry + 22, 20, PALETTE.gold);
    label(ctx, ledger.total.toLocaleString('en-US'), px + pw - 180, ry + 22, 22, PALETTE.gold, 'right', MONO);
    label(ctx, `SCRIP EARNED +${ledger.scrip}`, px + 36, ry + 52, 15, PALETTE.cyan, 'left', MONO);

    // Stars + verdict.
    starRow(ctx, px + 52, ry + 96, gradeInfo.stars, 15, 64);
    const starNames = ['ALL RINGS', 'UNDER PAR', 'NO DAMAGE'];
    starNames.forEach((name, i) => {
      label(ctx, name, px + 52 + i * 64, ry + 124, 8, gradeInfo.stars[i] ? PALETTE.gold : PALETTE.textDim, 'center', MONO);
    });
    label(ctx, gradeInfo.verdict, px + pw / 2, ry + 150, 15, PALETTE.text, 'center');

    const by = py + ph - 58;
    if (ledger.complete && missionIndex < MISSIONS.length - 1) {
      button(ctx, 'next', px + 36, by, 170, 40, 'NEXT SORTIE (N)', 'go');
    }
    button(ctx, 'retry', px + 220, by, 150, 40, 'RETRY (R)');
    button(ctx, 'hangar', px + 384, by, 150, 40, 'HANGAR (H)');
    button(ctx, 'briefing', px + pw - 186, by, 150, 40, 'BRIEFING (ESC)');
  }

  function drawPaused(ctx, size) {
    const W = size.width;
    const H = size.height;
    ctx.fillStyle = 'rgba(6, 20, 28, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.letterSpacing = '8px';
    label(ctx, 'PAUSED', W / 2, H / 2 - 10, 54, PALETTE.text, 'center');
    ctx.restore();
    label(ctx, 'P or ESC to resume · R to restart the sortie', W / 2, H / 2 + 30, 16, PALETTE.textDim, 'center');
  }

  /** Paint the HUD layer for the current screen. Buttons are rebuilt each call. */
  function draw(ctx, size, game) {
    buttons = [];
    if (game.screen === SCREEN_PLAY || game.screen === SCREEN_PAUSED) {
      drawFlightHud(ctx, size, game);
      if (game.screen === SCREEN_PAUSED) drawPaused(ctx, size);
    } else if (game.screen === SCREEN_BRIEFING) {
      drawBriefing(ctx, size, game);
    } else if (game.screen === SCREEN_HANGAR) {
      drawHangar(ctx, size, game);
    } else if (game.screen === SCREEN_DEBRIEF) {
      drawFlightHud(ctx, size, game);
      drawDebrief(ctx, size, game);
    }
  }

  /** The id of the button at a point, from the last drawn frame, or null. */
  function hitTest(x, y) {
    for (const b of buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }

  return { draw, hitTest };
}
