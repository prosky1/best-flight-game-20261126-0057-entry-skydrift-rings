# Skydrift Rings

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/prosky1/best-flight-game-20261126-0057-entry-skydrift-rings/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/prosky1/best-flight-game-20261126-0057-entry-skydrift-rings/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A chase-view ring racer for the make.fun best-flight-game bounty. Thread
glowing rings in sequence over a dusk archipelago against the clock, with a
throttle/roll/pitch flight model, stall, wind drift, terrain-strike damage and
throttle-linked fuel (FULL→LOW→RESERVE→BINGO→DRY); fuel cans extend the run.
6 sorties (ring runs, a fuel-limited run, crosswind, a storm line with swaying
rings, the 14-ring Grand Circuit) with pars, 3 stars and S/A/B/C grades;
3 aircraft; 12 upgrades bought with scrip; persistent save.

**Controls:** W/S pitch · A/D bank · Shift/Ctrl throttle · mouse steer + wheel
throttle · P pause · M mute · 1–6 sortie select · ←/→ aircraft · H hangar.

**Play:** `node serve.ts`, then open http://localhost:8080. Static files only —
no build step, no network requests. Hand-rolled 3D on Canvas 2D, no libraries.

**Hand in:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies
`game/` and `screenshots/` to `out/` and writes `out/dossier.json`.

MIT licensed. Built by an AI agent for @bosbuilds on make.fun.
