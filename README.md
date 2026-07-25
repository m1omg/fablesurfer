# Fable Surfer 🏃‍♂️🚇

A browser-based endless runner in the spirit of *Subway Surfers* — built with
Three.js, procedural low-poly art plus a handful of AI-generated textures
(embedded as data URIs), and WebAudio-synthesised sound. No build step, no
external asset requests, no network required.

**▶ Play online:** https://m1omg.github.io/fablesurfer/ — every push to the
working branch redeploys automatically via GitHub Pages.

**Or run it locally:** open `index.html` in any modern browser (double-click works), or serve it:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## About the game it's modelled on

*Subway Surfers* (Kiloo / SYBO Games, 2012) is one of the most-downloaded
mobile games ever made — the first title to pass one billion downloads on
Google Play. A teenage graffiti artist is caught tagging a train yard by a
grumpy inspector and his dog, and flees down the tracks in a never-ending
chase viewed from a behind-the-back camera.

Its signature mechanics, all recreated here:

- **Auto-run over three lanes** — swipe/steer left and right, **jump** over
  low obstacles, **roll** under overhead ones, with the run getting steadily
  faster the longer you survive.
- **Trains as terrain** — you don't just dodge trains; ramps let you sprint
  onto their roofs and run along the top of the traffic. Oncoming trains
  barrel down lanes toward you.
- **Two grades of collision** — a glancing side-swipe makes you stumble and
  lets the inspector close in right behind you (a second stumble while he's
  near means you're caught); a head-on hit ends the run instantly.
- **Coins & power-ups** — coin rows/arcs/rooftop trails, plus the classic
  four: **Jetpack** (soar above the track hoovering up coins), **Coin
  Magnet**, **Super Sneakers** (mega-jump), and a **2× score multiplier** —
  and the **hoverboard**, activated on demand, which absorbs one crash.
- **Score = distance × multiplier**, coins tracked separately, best score
  saved between runs.

This clone recreates those mechanics with original code, names, and art.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Change lane | ← / → or A / D | swipe left / right |
| Jump | ↑ / W / Space | swipe up |
| Roll (or air-slam) | ↓ / S | swipe down |
| Hoverboard | H | double-tap |
| Pause | P / Esc | — |
| Restart after a run | R | tap button |

## Tech notes

- `index.html` + `style.css` — shell, HUD, menus
- `js/game.js` — all game logic (plain script, no modules so it runs from
  `file://`)
- `js/textures.js` — five AI-generated environment textures (brick, gravel,
  graffiti, coin face, foliage — GPT Image via the Codex CLI), downscaled,
  quantized and embedded as data URIs so the game still works offline with
  zero asset requests. The game degrades to flat-color procedural art if
  this file is missing.
- `js/char-textures.js` — three AI-generated character fabric textures
  (denim, knit, canvas), near-white so they tint to any clothing colour;
  same embed-as-data-URI approach.
- `vendor/three.min.js` — Three.js r147 UMD build, vendored so the game works
  offline
- Everything else is procedural low-poly (boxes + lambert materials + fog);
  sounds and the little chiptune loop are synthesised with WebAudio at
  runtime.
- `index.html#autostart` skips the menu and exposes `__FS_step(seconds)` for
  automated screenshots/testing alongside the read-only `__FS` hooks.
