# Fable Surfer 🏃‍♂️🚇

A browser-based endless runner in the spirit of *Subway Surfers* — built with
Three.js, fully procedural art, and WebAudio-synthesised sound. No build step,
no external assets, no network required.

**Play it:** open `index.html` in any modern browser (double-click works), or serve it:

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
- `js/game.js` — all game logic (~900 lines, plain script, no modules so it
  runs from `file://`)
- `vendor/three.min.js` — Three.js r147 UMD build, vendored so the game works
  offline
- Art is procedural low-poly (boxes + lambert materials + fog); sounds and the
  little chiptune loop are synthesised with WebAudio at runtime.
