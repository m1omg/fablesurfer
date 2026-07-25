# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fable Surfer — a browser-based endless runner (Subway Surfers–style) built with vanilla Three.js. No build step, no package manager, no tests, no external assets or network calls. All art is procedural (boxes + lambert materials, canvas-generated textures) and all sound is synthesised with WebAudio at runtime.

## Running

Open `index.html` directly in a browser (`file://` works — this is why the code uses plain scripts, no ES modules), or serve it:

```sh
python3 -m http.server 8000
```

Deployment: pushes to the `claude/subway-surfers-overview-po5y8y` branch auto-deploy to GitHub Pages via `.github/workflows/deploy-pages.yml` (publishes to the `gh-pages` branch). Live at https://m1omg.github.io/fablesurfer/.

## Structure

- `index.html` + `style.css` — shell, HUD, menu/game-over/pause overlays
- `js/game.js` — **all** game logic in one ~1400-line IIFE, plain ES5-style script
- `js/textures.js` — AI-generated environment textures (GPT Image via Codex CLI: brick, gravel, graffiti, coin, leaves) embedded as data URIs on `window.FS_TEX`; keeps `file://` working (file-loaded images would taint WebGL in Chrome). `game.js` must degrade gracefully to flat colors when a texture is absent — preserve that when adding art.
- `js/char-textures.js` — AI-generated **character** fabric textures (denim, knit, canvas), near-white so they tint via `material.color`; `Object.assign`ed into `window.FS_TEX`. Must load after `textures.js`, before `game.js`. Consumed by the `fabric(color, kind)` helper.
- `vendor/three.min.js` — Three.js r147 UMD build, vendored for offline use. Use r147 APIs (`outputEncoding`, `sRGBEncoding`, etc.), not modern Three.js.

## Architecture of js/game.js

Everything lives in one IIFE, organized top-to-bottom in banner-commented sections; state is shared module-level vars, not classes:

1. **Constants** — lane positions (`LANE_X`), physics (`GRAVITY`, `JUMP_V`), obstacle dimensions (`TRAIN_H`, `HURDLE_H`, `OVERHANG_LO/HI`), player hitbox halves.
2. **Renderer/scene** — colors are authored in sRGB and passed through `conv()` (`convertSRGBToLinear`) so the sRGB output pass doesn't wash them out; new colored materials should follow this pattern (the `lam()` helper does it).
3. **Environment** — the player stays at z≈0; motion is simulated by streaming ties/fences/buildings toward the camera (+z) and recycling them past the kill line. Ballast/rails are static strips.
4. **Characters** — `buildRunner()` builds both player and inspector from primitives; `animateRun`/`poseAirborne` pose the returned limb groups.
5. **Obstacles/pickups** — `makeTrain/makeHurdle/makeOverhang/makeCoin/makePowerup` push entries onto the `obstacles`/`coins`/`powerups` arrays consumed by collision code.
6. **Pattern spawner** — `PATTERNS` is a list of functions that each place a pattern at z and return its length; every pattern must leave a survivable route (tracked via `prevFreeLanes`). `TIERS` unlocks harder patterns by distance traveled. Spawning is distance-driven via `spawnGap`.
7. **Audio** — `beep()`/`noiseHit()` synth primitives; the chiptune loop is scheduled sample-accurately by `scheduleMusic()` on a lookahead `setInterval`.
8. **Game state & loop** — a string `state` machine (`menu | running | paused | dying | over`). `frame()` drives per-frame updates: `updateWorld` (streaming/spawning), `updatePlayer` (lane steering, vertical physics with train-roof/ramp support, collisions, pickups), `updateGuard`, `updateVisuals`, `updateHud`.

Collision has two grades, matching the original game: a glancing side-swipe (small X penetration during a lane switch) calls `stumble()` — a second stumble while `stumbleT > 0` means the inspector catches you; a head-on hit calls `crash()` (absorbed by hoverboard/jetpack/invincibility, otherwise instant game over).

## Testing hooks

`window.__FS` exposes read-only getters (state, player position/lane, speed, score, coins, obstacle list) for automated testing and debugging from the console or a headless browser. Opening `index.html#autostart` skips the menu and additionally exposes `window.__FS_step(seconds)`, which advances the simulation deterministically at 60 Hz and renders a frame — useful when the tab is background-throttled (e.g. driving the game via browser automation).

`index.html#shot=<sec>[&act=roll|jump|tumble]` advances to a fixed sim time (optionally triggering an action), then freezes the render (`__FS_freeze`) so a single **headless one-shot screenshot** captures an exact, deterministic pose. Firefox headless has no WebGL here; use Chromium with SwiftShader (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, e.g. the Playwright-cached Chromium) to render the canvas.

Character animation lives in `poseRunner(runner, dt, mode, phase, amp)` + `damp()`: it computes a target pose per mode (`run`/`air`/`tuck`) and exponentially damps each joint toward it, so state transitions blend instead of snapping. Knee bend is squared (`bend²`) to stay C1-smooth at the gait's zero-crossing.
