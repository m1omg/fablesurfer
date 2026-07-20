/* =========================================================================
   FABLE SURFER — an endless-runner in the spirit of the subway-chase
   classics. Plain Three.js (vendored, r147), no other dependencies.
   All art is generated procedurally; all sound is WebAudio-synthesised.
   ========================================================================= */
(function () {
"use strict";

/* ------------------------------------------------------------------ *
 *  Constants
 * ------------------------------------------------------------------ */
var LANE_X      = [-2.5, 0, 2.5];
var LANE_HALF   = 1.15;          // half width of an occupied lane
var BASE_SPEED  = 13;
var MAX_SPEED   = 34;
var GRAVITY     = 38;
var JUMP_V      = 13.2;
var SNEAKER_V   = 17.5;
var SLAM_V      = -30;
var ROLL_TIME   = 0.75;
var TRAIN_H     = 2.6;           // roof height
var TRAIN_W     = 1.15;          // half width
var RAMP_LEN    = 4.2;
var HURDLE_H    = 1.0;
var OVERHANG_LO = 1.15;          // bottom of the overhead bar
var OVERHANG_HI = 2.35;
var SPAWN_Z     = -165;
var KILL_Z      = 22;
var P_HALF_W    = 0.42;
var P_HALF_D    = 0.4;
var STAND_H     = 1.7;
var ROLL_H      = 0.8;

var PU_TIME = { magnet: 12, sneakers: 12, mult: 15, jetpack: 5.5 };
var BOARD_TIME = 30;

/* ------------------------------------------------------------------ *
 *  DOM / persistence
 * ------------------------------------------------------------------ */
var $ = function (id) { return document.getElementById(id); };
var elWrap = $("wrap"), elHud = $("hud"), elMenu = $("menu"),
    elOver = $("gameover"), elPaused = $("paused"),
    elScore = $("score"), elHi = $("hiscore"), elCoins = $("coins"),
    elMultRow = $("mult-row"), elPu = $("powerups");

function loadHi() {
  try { return parseInt(localStorage.getItem("fablesurfer_hi") || "0", 10) || 0; }
  catch (e) { return 0; }
}
function saveHi(v) {
  try { localStorage.setItem("fablesurfer_hi", String(v)); } catch (e) {}
}
var hiScore = loadHi();
$("menu-hi").textContent = hiScore;

/* ------------------------------------------------------------------ *
 *  Renderer / scene / camera
 * ------------------------------------------------------------------ */
var canvas   = $("game");
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9ff);
scene.fog = new THREE.Fog(0x87c9ff, 55, 150);

var camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);
camera.position.set(0, 5, 8.2);

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a7f6a, 1.05));
var sun = new THREE.DirectionalLight(0xfff2d9, 0.85);
sun.position.set(30, 60, 25);
scene.add(sun);

/* ------------------------------------------------------------------ *
 *  Shared materials / geometries
 * ------------------------------------------------------------------ */
function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }

var MAT = {
  ballast:  lam(0x5c5852),
  tie:      lam(0x3d3129),
  rail:     lam(0xb8bcc4),
  fence:    lam(0x88919b),
  hurdleW:  lam(0xd9a441),
  hurdleS:  lam(0xc8352c),
  post:     lam(0x666e78),
  bar:      lam(0xd23c30),
  coin:     new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a5a00 }),
  skin:     lam(0xe8b58a),
  board:    new THREE.MeshLambertMaterial({ color: 0x37e6c8, emissive: 0x0a5c4d }),
};

var trainColors = [0xd94141, 0x3f7fd4, 0x3fae5c, 0xe08b2d, 0x9a5fd0];
var bldgColors  = [0xc9b8a3, 0xa3b6c9, 0xc0a3c9, 0xb0c9a3, 0xc9a3a3, 0x9aa7b5];

var coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14);

/* ------------------------------------------------------------------ *
 *  Static / recycled environment
 * ------------------------------------------------------------------ */
// ballast slab + rails are long static strips; motion is sold by the ties,
// fences and buildings streaming toward the camera.
(function buildStatic() {
  var slab = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.3, 320), MAT.ballast);
  slab.position.set(0, -0.15, -130);
  scene.add(slab);
  var side = new THREE.Mesh(new THREE.BoxGeometry(30, 0.28, 320), lam(0x6f6a5f));
  side.position.set(-19, -0.16, -130); scene.add(side);
  side = side.clone(); side.position.x = 19; scene.add(side);

  for (var l = 0; l < 3; l++) {
    for (var s = -1; s <= 1; s += 2) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 320), MAT.rail);
      rail.position.set(LANE_X[l] + s * 0.72, 0.06, -130);
      scene.add(rail);
    }
  }
  // clouds
  for (var i = 0; i < 7; i++) {
    var cl = new THREE.Mesh(new THREE.BoxGeometry(9 + Math.random() * 8, 1.6, 3), lam(0xffffff));
    cl.position.set(-60 + Math.random() * 120, 32 + Math.random() * 14, -140 - Math.random() * 60);
    scene.add(cl);
  }
})();

var ties = [];
(function buildTies() {
  var g = new THREE.BoxGeometry(10.6, 0.1, 0.55);
  for (var i = 0; i < 90; i++) {
    var t = new THREE.Mesh(g, MAT.tie);
    t.position.set(0, 0.01, 14 - i * 2.4);
    scene.add(t); ties.push(t);
  }
})();

var fences = [];
(function buildFences() {
  var g = new THREE.BoxGeometry(0.25, 1.5, 11);
  for (var i = 0; i < 22; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var f = new THREE.Mesh(g, MAT.fence);
      f.position.set(s * 6.4, 0.75, 16 - i * 12);
      scene.add(f); fences.push(f);
    }
  }
})();

var buildings = [];
function styleBuilding(b) {
  var w = 7 + Math.random() * 8, h = 8 + Math.random() * 22, d = 12 + Math.random() * 10;
  b.scale.set(w, h, d);
  b.position.y = h / 2 - 0.2;
  b.material = lam(bldgColors[(Math.random() * bldgColors.length) | 0]);
}
(function buildBuildings() {
  var g = new THREE.BoxGeometry(1, 1, 1);
  for (var i = 0; i < 16; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var b = new THREE.Mesh(g, MAT.fence);
      styleBuilding(b);
      b.position.x = s * (13.5 + Math.random() * 5);
      b.position.z = 20 - i * 24 + (s > 0 ? 9 : 0);
      scene.add(b); buildings.push(b);
    }
  }
})();

/* ------------------------------------------------------------------ *
 *  Character builder (player, inspector)
 * ------------------------------------------------------------------ */
function limb(w, len, d, mat, x, y, z) {
  var g = new THREE.BoxGeometry(w, len, d);
  g.translate(0, -len / 2, 0);            // pivot at the top
  var m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

function buildRunner(opts) {
  var body = new THREE.Group();           // rotates for the somersault
  var g = new THREE.Group();              // world placement
  g.add(body);

  var shirt = lam(opts.shirt), pants = lam(opts.pants), capM = lam(opts.cap);

  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.42), shirt);
  torso.position.y = 1.16; body.add(torso);

  var pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.22), lam(opts.pack));
  pack.position.set(0, 1.2, 0.3); body.add(pack);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), MAT.skin);
  head.position.y = 1.85; body.add(head);

  var capTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), capM);
  capTop.position.y = 2.11; body.add(capTop);
  var brim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.26), capM);
  brim.position.set(0, 2.06, -0.34); body.add(brim);

  var armL = limb(0.18, 0.62, 0.18, shirt, -0.47, 1.52, 0); body.add(armL);
  var armR = limb(0.18, 0.62, 0.18, shirt,  0.47, 1.52, 0); body.add(armR);
  var legL = limb(0.22, 0.78, 0.22, pants, -0.19, 0.78, 0); body.add(legL);
  var legR = limb(0.22, 0.78, 0.22, pants,  0.19, 0.78, 0); body.add(legR);

  return { group: g, body: body, armL: armL, armR: armR, legL: legL, legR: legR };
}

function animateRun(r, phase, amp) {
  r.armL.rotation.x =  Math.sin(phase) * amp;
  r.armR.rotation.x = -Math.sin(phase) * amp;
  r.legL.rotation.x = -Math.sin(phase) * amp;
  r.legR.rotation.x =  Math.sin(phase) * amp;
}

var player = buildRunner({ shirt: 0x00b8e6, pants: 0x2d4a8a, cap: 0xe23a3a, pack: 0xe0a92d });
scene.add(player.group);

var blob = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.55, 0.02, 16),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
scene.add(blob);

var board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 1.5), MAT.board);
board.visible = false;
scene.add(board);

// the inspector + dog, chasing behind
var guard = buildRunner({ shirt: 0x2a3b66, pants: 0x1c2846, cap: 0x2a3b66, pack: 0x1c2846 });
scene.add(guard.group);
var dog = (function () {
  var g = new THREE.Group();
  var bodyM = lam(0x8a6034);
  var b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.8), bodyM);
  b.position.y = 0.42; g.add(b);
  var h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.34), bodyM);
  h.position.set(0, 0.62, -0.5); g.add(h);
  for (var i = 0; i < 4; i++) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), bodyM);
    leg.position.set(i % 2 ? 0.12 : -0.12, 0.15, i < 2 ? -0.28 : 0.28);
    g.add(leg);
  }
  scene.add(g);
  return g;
})();

/* ------------------------------------------------------------------ *
 *  Obstacle / pickup construction
 * ------------------------------------------------------------------ */
var obstacles = [], coins = [], powerups = [];

function makeTrain(lane, z, len, opts) {
  var color = trainColors[(Math.random() * trainColors.length) | 0];
  var g = new THREE.Group();
  var bodyLen = opts.ramp ? len - RAMP_LEN : len;
  var bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2, TRAIN_H, bodyLen), lam(color));
  bodyMesh.position.set(0, TRAIN_H / 2, opts.ramp ? -RAMP_LEN / 2 : 0);
  g.add(bodyMesh);
  var roof = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 - 0.2, 0.12, bodyLen - 0.2), lam(0xd8d8d8));
  roof.position.set(0, TRAIN_H + 0.06, bodyMesh.position.z);
  g.add(roof);
  var win = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.04, 0.55, bodyLen - 1),
                           lam(0xbfe3f2));
  win.position.set(0, TRAIN_H * 0.62, bodyMesh.position.z);
  g.add(win);
  if (opts.ramp) {
    // sloped tail the runner can sprint up
    var ramp = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2, 0.25, Math.hypot(RAMP_LEN, TRAIN_H) + 0.4), lam(0x777d85));
    ramp.position.set(0, TRAIN_H / 2, len / 2 - RAMP_LEN / 2);
    ramp.rotation.x = Math.atan2(TRAIN_H, RAMP_LEN);
    g.add(ramp);
  }
  if (opts.moving) {
    var lightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
    lightMesh.position.set(0, 1.1, len / 2 + 0.05);
    g.add(lightMesh);
  }
  g.position.set(LANE_X[lane], 0, z);
  scene.add(g);
  obstacles.push({ kind: "train", mesh: g, lane: lane, halfLen: len / 2,
                   ramp: !!opts.ramp, moving: opts.moving || 0 });
}

function makeHurdle(lane, z) {
  var g = new THREE.Group();
  var top = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.3, 0.18), MAT.hurdleS);
  top.position.y = HURDLE_H - 0.15; g.add(top);
  var mid = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.18, 0.14), MAT.hurdleW);
  mid.position.y = HURDLE_H - 0.55; g.add(mid);
  for (var s = -1; s <= 1; s += 2) {
    var legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, HURDLE_H, 0.12), MAT.post);
    legMesh.position.set(s * (LANE_HALF - 0.1), HURDLE_H / 2, 0);
    g.add(legMesh);
  }
  g.position.set(LANE_X[lane], 0, z);
  scene.add(g);
  obstacles.push({ kind: "hurdle", mesh: g, lane: lane, halfLen: 0.22, moving: 0 });
}

function makeOverhang(lane, z) {
  var g = new THREE.Group();
  var bar = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_HALF * 2, OVERHANG_HI - OVERHANG_LO, 0.4), MAT.bar);
  bar.position.y = (OVERHANG_LO + OVERHANG_HI) / 2; g.add(bar);
  var sign = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 1.4, 0.35, 0.05), lam(0xf2e6c8));
  sign.position.set(0, (OVERHANG_LO + OVERHANG_HI) / 2, -0.24); g.add(sign);
  for (var s = -1; s <= 1; s += 2) {
    var postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, OVERHANG_HI, 0.14), MAT.post);
    postMesh.position.set(s * (LANE_HALF - 0.05), OVERHANG_HI / 2, 0);
    g.add(postMesh);
  }
  g.position.set(LANE_X[lane], 0, z);
  scene.add(g);
  obstacles.push({ kind: "overhang", mesh: g, lane: lane, halfLen: 0.28, moving: 0 });
}

function makeCoin(lane, z, y) {
  var g = new THREE.Group();
  var c = new THREE.Mesh(coinGeo, MAT.coin);
  c.rotation.x = Math.PI / 2;
  g.add(c);
  g.position.set(LANE_X[lane], y, z);
  scene.add(g);
  coins.push({ mesh: g });
}

function coinRow(lane, z, n, y) {
  for (var i = 0; i < n; i++) makeCoin(lane, z - i * 1.5, y || 0.9);
}
function coinArc(lane, z) {
  for (var i = 0; i < 7; i++) {
    var t = i / 6;
    makeCoin(lane, z - i * 1.05, 0.9 + Math.sin(t * Math.PI) * 1.5);
  }
}

var PU_DEFS = {
  magnet:   { color: 0xe23a3a, label: "MAGNET" },
  sneakers: { color: 0x3fd45c, label: "SNEAKERS" },
  mult:     { color: 0xff7edb, label: "2× SCORE" },
  jetpack:  { color: 0x8ab6ff, label: "JETPACK" },
};
function makePowerup(lane, z, type) {
  var def = PU_DEFS[type];
  var g = new THREE.Group();
  var core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55),
    new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.35 }));
  core.rotation.set(0.6, 0.6, 0);
  g.add(core);
  g.position.set(LANE_X[lane], 1.25, z);
  scene.add(g);
  powerups.push({ mesh: g, type: type, core: core });
}

/* ------------------------------------------------------------------ *
 *  Pattern spawner — every pattern leaves a survivable route
 * ------------------------------------------------------------------ */
var spawnGap = 0;         // metres until the next pattern
var prevFreeLanes = [0, 1, 2];

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function shuffled3() {
  var a = [0, 1, 2];
  for (var i = 2; i > 0; i--) {
    var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function maybePowerup(lane, z) {
  if (Math.random() < 0.14) makePowerup(lane, z, pick(["magnet", "sneakers", "mult", "jetpack"]));
}

var PATTERNS = [
  function singleHurdle(z) {
    var l = shuffled3();
    makeHurdle(l[0], z - 2);
    coinArc(l[0], z + 1);
    coinRow(l[1], z - 1, 5);
    return 14;
  },
  function singleOverhang(z) {
    var l = shuffled3();
    makeOverhang(l[0], z - 2);
    coinRow(l[0], z - 1, 5, 0.6);
    maybePowerup(l[1], z - 4);
    return 14;
  },
  function doubleBlock(z) {
    var l = shuffled3();
    makeHurdle(l[0], z - 2);
    makeOverhang(l[1], z - 2);
    coinRow(l[2], z, 6);
    prevFreeLanes = [l[2]];
    return 16;
  },
  function zigzag(z) {
    var l = shuffled3();
    makeHurdle(l[0], z - 2);
    makeHurdle(l[1], z - 10);
    makeOverhang(l[2], z - 18);
    coinRow(l[1], z - 1, 4);
    coinRow(l[2], z - 9, 4);
    return 26;
  },
  function rampTrain(z) {
    var l = shuffled3();
    var len = 16;
    makeTrain(l[0], z - len / 2 - 1, len, { ramp: true });
    coinRow(l[0], z - 6, 6, TRAIN_H + 0.6);       // roof loot
    makeHurdle(l[1], z - 8);
    coinRow(l[2], z - 2, 6);
    prevFreeLanes = [l[2]];
    return len + 10;
  },
  function trainWall(z) {
    var l = shuffled3();
    var len = 18;
    makeTrain(l[0], z - len / 2 - 1, len, { ramp: true });
    makeTrain(l[1], z - len / 2 - 5, len, {});
    coinRow(l[0], z - 7, 7, TRAIN_H + 0.6);
    makeOverhang(l[2], z - 6);
    coinRow(l[2], z - 8, 5, 0.6);
    prevFreeLanes = [l[2]];
    return len + 12;
  },
  function movingTrain(z) {
    var lane = pick(prevFreeLanes);
    var others = [0, 1, 2].filter(function (x) { return x !== lane; });
    makeTrain(lane, z - 12, 18, { moving: 8 + Math.random() * 4 });
    makeHurdle(others[0], z - 6);
    coinRow(others[1], z - 2, 7);
    prevFreeLanes = others;
    return 30;
  },
  function coinFeast(z) {
    coinRow(0, z, 7); coinRow(1, z - 2, 7); coinRow(2, z, 7);
    maybePowerup(1, z - 14);
    prevFreeLanes = [0, 1, 2];
    return 18;
  },
];

// pattern indices unlocked by distance: ramp trains from the start,
// train walls & zigzags soon after, moving trains once the run is rolling
var TIERS = [
  { at: 0,   patterns: [0, 1, 2, 4] },            // hurdle, overhang, double, rampTrain
  { at: 250, patterns: [0, 1, 2, 3, 4, 5, 7] },   // + zigzag, trainWall, coinFeast
  { at: 600, patterns: [0, 1, 2, 3, 4, 5, 6, 7] } // + movingTrain
];
function spawnPattern(z) {
  var tier = TIERS[0];
  for (var i = 0; i < TIERS.length; i++) if (traveled >= TIERS[i].at) tier = TIERS[i];
  var fn = PATTERNS[pick(tier.patterns)];
  var len = fn(z);
  return len + 9 + Math.random() * 7;
}

/* ------------------------------------------------------------------ *
 *  Audio — tiny WebAudio synth
 * ------------------------------------------------------------------ */
var actx = null, musicOn = true, musicTimer = null, musicBeat = 0;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function beep(freq, dur, type, vol, slideTo, when) {
  var ctx = audio(); if (!ctx) return;
  var t = when || ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || "square";
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
var sfx = {
  coin:    function () { beep(1150, 0.07, "square", 0.06, 1500); },
  jump:    function () { beep(320, 0.16, "sine", 0.12, 620); },
  roll:    function () { beep(220, 0.14, "triangle", 0.1, 90); },
  powerup: function () { var c = audio(); if (!c) return;
             [660, 880, 1320].forEach(function (f, i) { beep(f, 0.1, "square", 0.08, null, c.currentTime + i * 0.07); }); },
  board:   function () { beep(140, 0.35, "sawtooth", 0.07, 260); },
  stumble: function () { beep(140, 0.18, "sawtooth", 0.16, 70); },
  crash:   function () { beep(180, 0.4, "sawtooth", 0.2, 35); beep(90, 0.5, "square", 0.14, 30); },
};
// minimal original two-bar chiptune loop
var BASS  = [110, 110, 165, 110, 131, 131, 98, 123];
function musicTick() {
  var ctx = audio(); if (!ctx || !musicOn || state !== "running") return;
  var t = ctx.currentTime;
  beep(BASS[musicBeat % 8], 0.16, "triangle", 0.05, null, t);
  if (musicBeat % 2 === 0) beep(60, 0.1, "sine", 0.09, 40, t);         // kick
  if (musicBeat % 4 === 2) beep(4000, 0.03, "square", 0.015, null, t); // hat
  musicBeat++;
}

/* ------------------------------------------------------------------ *
 *  Game state
 * ------------------------------------------------------------------ */
var state = "menu";        // menu | running | paused | dying | over
var speed, traveled, score, coinCount, mult;
var px, py, vy, curLane, targetLane, prevLane, grounded, coyote;
var rollT, runPhase, jetY;
var stumbleT, hitCooldown, invincibleT, dyingT, caught;
var guardZ;
var pu;                    // active power-up timers
var boardT;                // hoverboard time left
var shakeT = 0;

function resetRun() {
  obstacles.concat(coins, powerups).forEach(function (o) { scene.remove(o.mesh); });
  obstacles.length = coins.length = powerups.length = 0;

  speed = BASE_SPEED; traveled = 0; score = 0; coinCount = 0; mult = 1;
  px = 0; py = 0; vy = 0; curLane = 1; targetLane = 1; prevLane = 1;
  grounded = true; coyote = 0; rollT = 0; runPhase = 0;
  stumbleT = 0; hitCooldown = 0; invincibleT = 0; dyingT = 0; caught = false;
  guardZ = 3.2; boardT = 0; musicBeat = 0;
  pu = { magnet: 0, sneakers: 0, mult: 0, jetpack: 0 };

  player.group.rotation.set(0, 0, 0);
  player.body.rotation.set(0, 0, 0);
  guard.group.rotation.set(0, 0, 0);

  // pre-fill the track with a clear runway, then patterns
  var z = -55;
  while (z > SPAWN_Z) { z -= spawnPattern(z); }
  spawnGap = -(z - SPAWN_Z);

  elCoins.textContent = "0";
  elHi.textContent = hiScore;
}

function startGame() {
  resetRun();
  state = "running";
  elMenu.classList.add("hidden");
  elOver.classList.add("hidden");
  elHud.classList.remove("hidden");
  audio();
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = setInterval(musicTick, 190);
}

function endGame(wasCaught) {
  state = "dying";
  caught = wasCaught;
  dyingT = 0;
  sfx.crash();
  shakeT = 0.5;
  flash();
}

function showGameOver() {
  state = "over";
  var s = Math.floor(score);
  var record = s > hiScore;
  if (record) { hiScore = s; saveHi(s); }
  $("go-title").textContent = caught ? "BUSTED!" : "WIPEOUT!";
  $("go-score").textContent = s;
  $("go-coins").textContent = coinCount;
  $("go-hi").textContent = hiScore;
  $("new-record").classList.toggle("hidden", !record);
  $("menu-hi").textContent = hiScore;
  elOver.classList.remove("hidden");
  elHud.classList.add("hidden");
}

function flash() {
  elWrap.classList.remove("flash");
  void elWrap.offsetWidth;               // restart the CSS animation
  elWrap.classList.add("flash");
}

function stumble(pushToLane) {
  if (hitCooldown > 0 || invincibleT > 0) return;
  if (stumbleT > 0) { endGame(true); return; }   // second bump: the inspector grabs you
  stumbleT = 6;
  hitCooldown = 1;
  shakeT = 0.35;
  sfx.stumble();
  flash();
  if (pushToLane !== undefined) {
    targetLane = curLane = pushToLane;
    px = LANE_X[pushToLane];
  }
}

function crash() {
  if (invincibleT > 0) return;
  if (pu.jetpack > 0) return;
  if (boardT > 0) {                      // the hoverboard takes the hit
    boardT = 0;
    invincibleT = 1.4;
    shakeT = 0.4;
    sfx.stumble();
    flash();
    return;
  }
  endGame(false);
}

function activateBoard() {
  if (state !== "running" || boardT > 0) return;
  boardT = BOARD_TIME;
  sfx.board();
}

function activatePowerup(type) {
  sfx.powerup();
  pu[type] = PU_TIME[type];
  if (type === "mult") mult = 2;
  if (type === "jetpack") { vy = 0; grounded = false; }
}

/* ------------------------------------------------------------------ *
 *  Input
 * ------------------------------------------------------------------ */
function goLeft()  { if (state !== "running") return; if (targetLane > 0) { prevLane = targetLane; targetLane--; } }
function goRight() { if (state !== "running") return; if (targetLane < 2) { prevLane = targetLane; targetLane++; } }
function doJump() {
  if (state !== "running" || pu.jetpack > 0) return;
  if (grounded || coyote > 0) {
    vy = pu.sneakers > 0 ? SNEAKER_V : JUMP_V;
    grounded = false; coyote = 0; rollT = 0;
    sfx.jump();
  }
}
function doRoll() {
  if (state !== "running" || pu.jetpack > 0) return;
  if (!grounded) vy = Math.min(vy, SLAM_V);      // air slam
  rollT = ROLL_TIME;
  sfx.roll();
}
function togglePause() {
  if (state === "running") { state = "paused"; elPaused.classList.remove("hidden"); }
  else if (state === "paused") { state = "running"; elPaused.classList.add("hidden"); lastT = 0; }
}

window.addEventListener("keydown", function (e) {
  var k = e.key;
  if (k === " " || k.indexOf("Arrow") === 0) e.preventDefault();
  if (state === "menu" && (k === " " || k === "Enter")) { startGame(); return; }
  if (state === "over" && (k === "r" || k === "R" || k === " " || k === "Enter")) { startGame(); return; }
  switch (k) {
    case "ArrowLeft": case "a": case "A": goLeft(); break;
    case "ArrowRight": case "d": case "D": goRight(); break;
    case "ArrowUp": case "w": case "W": case " ": doJump(); break;
    case "ArrowDown": case "s": case "S": doRoll(); break;
    case "h": case "H": activateBoard(); break;
    case "p": case "P": case "Escape": togglePause(); break;
  }
});

// touch: swipe to steer, double-tap for the hoverboard
var tsX = 0, tsY = 0, lastTap = 0;
window.addEventListener("touchstart", function (e) {
  tsX = e.touches[0].clientX; tsY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener("touchend", function (e) {
  var dx = e.changedTouches[0].clientX - tsX;
  var dy = e.changedTouches[0].clientY - tsY;
  if (Math.abs(dx) < 26 && Math.abs(dy) < 26) {
    var now = performance.now();
    if (now - lastTap < 320) activateBoard();
    lastTap = now;
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0) goRight(); else goLeft(); }
  else { if (dy < 0) doJump(); else doRoll(); }
}, { passive: true });

$("btn-start").addEventListener("click", startGame);
$("btn-retry").addEventListener("click", startGame);
$("btn-resume").addEventListener("click", togglePause);
window.addEventListener("blur", function () { if (state === "running") togglePause(); });

/* ------------------------------------------------------------------ *
 *  Per-frame update
 * ------------------------------------------------------------------ */
function playerHeight() { return rollT > 0 ? ROLL_H : STAND_H; }

function updateWorld(dt) {
  var dz = speed * dt;
  traveled += dz;

  ties.forEach(function (t) { t.position.z += dz; if (t.position.z > 16) t.position.z -= 216; });
  fences.forEach(function (f) { f.position.z += dz; if (f.position.z > 22) f.position.z -= 264; });
  buildings.forEach(function (b) {
    b.position.z += dz;
    if (b.position.z > 30) { b.position.z -= 384; styleBuilding(b); }
  });

  for (var i = obstacles.length - 1; i >= 0; i--) {
    var o = obstacles[i];
    o.mesh.position.z += dz + o.moving * dt;
    if (o.mesh.position.z - o.halfLen > KILL_Z) { scene.remove(o.mesh); obstacles.splice(i, 1); }
  }
  for (i = coins.length - 1; i >= 0; i--) {
    var c = coins[i];
    c.mesh.position.z += dz;
    c.mesh.rotation.y += 4 * dt;
    if (c.mesh.position.z > KILL_Z) { scene.remove(c.mesh); coins.splice(i, 1); }
  }
  for (i = powerups.length - 1; i >= 0; i--) {
    var p = powerups[i];
    p.mesh.position.z += dz;
    p.core.rotation.y += 2.5 * dt;
    p.mesh.position.y = 1.25 + Math.sin(performance.now() / 300) * 0.12;
    if (p.mesh.position.z > KILL_Z) { scene.remove(p.mesh); powerups.splice(i, 1); }
  }

  spawnGap -= dz;
  while (spawnGap <= 0) spawnGap += spawnPattern(SPAWN_Z - spawnGap);
}

function updatePlayer(dt) {
  // lane steering
  var tx = LANE_X[targetLane];
  px += (tx - px) * Math.min(1, 14 * dt);
  if (Math.abs(px - tx) < 0.05) { px = px * 0.6 + tx * 0.4; curLane = targetLane; }
  else curLane = Math.abs(px - LANE_X[prevLane]) < Math.abs(px - tx) ? prevLane : targetLane;

  if (rollT > 0) rollT -= dt;
  if (coyote > 0) coyote -= dt;
  if (hitCooldown > 0) hitCooldown -= dt;
  if (invincibleT > 0) invincibleT -= dt;
  if (stumbleT > 0) stumbleT -= dt;

  // --- support: are we over a train roof or a ramp? ---
  var support = 0, onRamp = false, rampY = 0;
  for (var i = 0; i < obstacles.length; i++) {
    var o = obstacles[i];
    if (o.kind !== "train") continue;
    var oz = o.mesh.position.z, ox = o.mesh.position.x;
    if (Math.abs(ox - px) > TRAIN_W + P_HALF_W - 0.15) continue;
    var front = oz + o.halfLen, back = oz - o.halfLen;
    if (front < -P_HALF_D || back > P_HALF_D) continue;   // no z overlap with the player at z≈0
    if (o.ramp && front > -P_HALF_D && front < RAMP_LEN + P_HALF_D) {
      var t = Math.max(0, Math.min(1, (front - 0.2) / RAMP_LEN));
      rampY = t * TRAIN_H;
      if (py <= rampY + 0.55) { onRamp = true; support = Math.max(support, rampY); }
    } else if (py >= TRAIN_H - 0.5) {
      support = Math.max(support, TRAIN_H);
    }
  }

  // --- vertical physics ---
  if (pu.jetpack > 0) {
    jetY = 7.4;
    py += (jetY - py) * Math.min(1, 5 * dt);
    grounded = false;
  } else {
    vy -= GRAVITY * dt;
    py += vy * dt;
    if (onRamp && py < support) { py = support; vy = 0; grounded = true; }
    else if (py <= support && vy <= 0) {
      if (!grounded && vy < -20) rollT = Math.max(rollT, 0.3);  // hard landing tuck
      py = support; vy = 0; grounded = true;
    } else if (py > support + 0.02) {
      if (grounded) coyote = 0.12;
      grounded = false;
    }
    if (py < 0) { py = 0; vy = 0; grounded = true; }
  }

  // --- collisions ---
  var h = playerHeight();
  for (i = 0; i < obstacles.length; i++) {
    var ob = obstacles[i];
    var obx = ob.mesh.position.x, obz = ob.mesh.position.z;
    var halfW = ob.kind === "train" ? TRAIN_W : LANE_HALF;
    var penX = (halfW + P_HALF_W) - Math.abs(px - obx);
    var penZ = (ob.halfLen + P_HALF_D) - Math.abs(obz);
    if (penX <= 0 || penZ <= 0) continue;

    var hit = false;
    if (ob.kind === "train") {
      var frontZ = obz + ob.halfLen;
      var overRamp = ob.ramp && frontZ > -P_HALF_D && frontZ < RAMP_LEN + P_HALF_D;
      if (py >= TRAIN_H - 0.5) hit = false;                       // on / above the roof
      else if (overRamp &&
               py >= Math.max(0, (frontZ - 0.2)) / RAMP_LEN * TRAIN_H - 0.7) hit = false;
      else hit = true;
    } else if (ob.kind === "hurdle") {
      hit = py < HURDLE_H - 0.12;
    } else { // overhang
      hit = (py + h > OVERHANG_LO + 0.05) && (py < OVERHANG_HI);
    }
    if (!hit) continue;
    if (pu.jetpack > 0 || invincibleT > 0 || hitCooldown > 0) continue;

    if (penX < penZ * 0.55 && ob.kind !== "hurdle") {
      // glancing side-swipe while switching lanes → stumble, inspector closes in
      var safeLane = obx > px ? Math.max(0, ob.lane - 1) : Math.min(2, ob.lane + 1);
      stumble(safeLane);
    } else {
      crash();
    }
    break;
  }

  // --- coins ---
  var magnetOn = pu.magnet > 0 || pu.jetpack > 0;
  var magR = pu.jetpack > 0 ? 12 : 6;
  for (i = coins.length - 1; i >= 0; i--) {
    var cm = coins[i].mesh;
    var dx = cm.position.x - px, dyC = cm.position.y - (py + 0.9), dzC = cm.position.z;
    var d2 = dx * dx + dyC * dyC + dzC * dzC;
    if (magnetOn && d2 < magR * magR) {
      cm.position.x -= dx * Math.min(1, 12 * dt);
      cm.position.y -= dyC * Math.min(1, 12 * dt);
      cm.position.z -= dzC * Math.min(1, 12 * dt);
    }
    if (d2 < 1.1) {
      scene.remove(cm); coins.splice(i, 1);
      coinCount++; score += 10 * mult;
      sfx.coin();
      elCoins.textContent = coinCount;
    }
  }

  // --- power-up pickups ---
  for (i = powerups.length - 1; i >= 0; i--) {
    var pp = powerups[i], pm = pp.mesh;
    var pdx = pm.position.x - px, pdy = pm.position.y - (py + 1), pdz = pm.position.z;
    if (pdx * pdx + pdy * pdy + pdz * pdz < 1.6) {
      scene.remove(pm); powerups.splice(i, 1);
      activatePowerup(pp.type);
    }
  }

  // power-up timers
  for (var k in pu) {
    if (pu[k] > 0) {
      pu[k] -= dt;
      if (pu[k] <= 0 && k === "mult") mult = 1;
      if (pu[k] <= 0 && k === "jetpack") invincibleT = Math.max(invincibleT, 1.2);
    }
  }
  if (boardT > 0) boardT -= dt;
}

function updateGuard(dt) {
  var target = stumbleT > 0 ? 1.9 : (traveled < 15 ? 2.6 : 9.5);
  guardZ += (target - guardZ) * Math.min(1, 2.2 * dt);
  guard.group.position.set(px * 0.85, 0, guardZ);
  animateRun(guard, runPhase * 0.9, 0.85);
  dog.position.set(px * 0.85 + 1.1, Math.abs(Math.sin(runPhase * 0.5)) * 0.18, guardZ + 0.4);
}

function updateVisuals(dt) {
  var boardLift = boardT > 0 ? 0.28 : 0;
  player.group.position.set(px, py + boardLift, 0);

  board.visible = boardT > 0 && state !== "over";
  if (board.visible) {
    board.position.set(px, py + 0.14, 0);
    board.rotation.z = Math.sin(performance.now() / 180) * 0.06;
  }

  blob.position.set(px, 0.02 + (py >= TRAIN_H - 0.5 ? TRAIN_H + 0.08 : 0), 0);
  var sh = Math.max(0.25, 1 - py * 0.12);
  blob.scale.set(sh, 1, sh);

  if (state === "dying") {
    // tumble over
    player.body.rotation.x -= 9 * dt;
    player.group.position.z += 3.5 * dt;
  } else if (rollT > 0) {
    player.body.rotation.x = -(1 - rollT / ROLL_TIME) * Math.PI * 2;
    player.body.scale.y = 0.55;
  } else {
    player.body.rotation.x = 0;
    player.body.scale.y = 1;
    if (!grounded && pu.jetpack <= 0) {
      // jump pose
      player.legL.rotation.x = -1.1; player.legR.rotation.x = 0.5;
      player.armL.rotation.x = -2.4; player.armR.rotation.x = -2.4;
    } else {
      runPhase += speed * dt * 0.85;
      animateRun(player, runPhase, 1.05);
    }
  }
  // blink while invincible
  player.group.visible = invincibleT > 0 ? (Math.floor(performance.now() / 90) % 2 === 0) : true;

  // camera
  var camY = 4.9 + py * 0.35, camX = px * 0.55;
  if (shakeT > 0) {
    shakeT -= dt;
    camX += (Math.random() - 0.5) * shakeT * 1.2;
    camY += (Math.random() - 0.5) * shakeT * 1.2;
  }
  camera.position.x += (camX - camera.position.x) * Math.min(1, 8 * dt);
  camera.position.y += (camY - camera.position.y) * Math.min(1, 8 * dt);
  camera.lookAt(px * 0.75, 1.9 + py * 0.4, -12);
}

var puLabelCache = "";
function updateHud() {
  elScore.textContent = Math.floor(score);
  elMultRow.classList.toggle("hidden", mult <= 1);

  var chips = "";
  for (var k in pu) {
    if (pu[k] > 0) chips += '<div class="pu-chip">' + PU_DEFS[k].label +
      '<span class="pu-time">' + Math.ceil(pu[k]) + '</span></div>';
  }
  if (boardT > 0) chips += '<div class="pu-chip">BOARD<span class="pu-time">' +
      Math.ceil(boardT) + '</span></div>';
  if (chips !== puLabelCache) { elPu.innerHTML = chips; puLabelCache = chips; }
}

/* ------------------------------------------------------------------ *
 *  Main loop
 * ------------------------------------------------------------------ */
var lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!lastT) { lastT = t; return; }
  var dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  if (state === "running") {
    speed = Math.min(MAX_SPEED, BASE_SPEED + traveled * 0.011);
    updateWorld(dt);
    updatePlayer(dt);
    updateGuard(dt);
    score += speed * dt * mult;
    updateHud();
  } else if (state === "dying") {
    dyingT += dt;
    updateWorld(dt * 0.15);          // slow-mo
    if (caught) guardZ += (0.8 - guardZ) * Math.min(1, 6 * dt);
    guard.group.position.set(px * 0.85, 0, guardZ);
    if (dyingT > 0.9) showGameOver();
  } else if (state === "menu") {
    // idle world drift behind the menu
    runPhase += dt * 6;
    animateRun(player, runPhase, 0.5);
    updateGuard(dt);
  }

  updateVisuals(state === "paused" ? 0 : dt);
  renderer.render(scene, camera);
}

/* menu backdrop: place the runner and inspector */
px = 0; py = 0; speed = 0; traveled = 0; runPhase = 0;
rollT = 0; stumbleT = 0; invincibleT = 0; boardT = 0; guardZ = 3.2;
pu = { magnet: 0, sneakers: 0, mult: 0, jetpack: 0 };
mult = 1; score = 0; coinCount = 0; grounded = true; vy = 0;
curLane = targetLane = prevLane = 1;
elHi.textContent = hiScore;

requestAnimationFrame(frame);

// lightweight read-only hooks for automated testing / debugging
window.__FS = {
  get state() { return state; },
  get player() { return { x: px, y: py, lane: curLane, target: targetLane, grounded: grounded }; },
  get speed() { return speed; },
  get score() { return score; },
  get coins() { return coinCount; },
  get stumbles() { return stumbleT; },
  get obstacles() {
    return obstacles.map(function (o) {
      return { kind: o.kind, lane: o.lane, z: o.mesh.position.z,
               halfLen: o.halfLen, ramp: o.ramp, moving: o.moving };
    });
  },
};
})();
