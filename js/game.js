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
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// hex colors below are authored in sRGB; convert so the sRGB output pass
// doesn't wash them out
function conv(c) { return new THREE.Color(c).convertSRGBToLinear(); }

var scene = new THREE.Scene();
(function goldenHourSky() {
  var c = document.createElement("canvas"); c.width = 16; c.height = 256;
  var g2 = c.getContext("2d");
  var gr = g2.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.00, "#1d3c7d");
  gr.addColorStop(0.42, "#4f7ac4");
  gr.addColorStop(0.66, "#93b2e0");
  gr.addColorStop(0.84, "#ffd9a8");
  gr.addColorStop(1.00, "#ffb877");
  g2.fillStyle = gr; g2.fillRect(0, 0, 16, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  scene.background = tex;
})();
scene.fog = new THREE.Fog(conv(0xffc99a), 45, 140);

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

scene.add(new THREE.HemisphereLight(conv(0x8fb4e8), conv(0x6b5138), 0.85));
var sun = new THREE.DirectionalLight(conv(0xffd9a0), 1.35);
sun.position.set(-30, 27, -26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 60;  sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 2;  sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// low evening sun visible down the tracks
(function sunDisc() {
  var disc = new THREE.Mesh(new THREE.CircleGeometry(16, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3cd, fog: false }));
  disc.position.set(-30, 30, -300);
  scene.add(disc);
  var halo = new THREE.Mesh(new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.14 }));
  halo.position.set(-30, 30, -301);
  scene.add(halo);
})();

/* ------------------------------------------------------------------ *
 *  Shared materials / geometries
 * ------------------------------------------------------------------ */
function lam(c) { return new THREE.MeshLambertMaterial({ color: conv(c) }); }
function shade(c, f) { return conv(c).multiplyScalar(f); }

var MAT = {
  ballast:  lam(0x4a443c),
  tie:      lam(0x33231a),
  rail:     lam(0xd8dde6),
  wall:     lam(0x968e80),
  hurdleW:  lam(0xe8a72e),
  hurdleS:  lam(0xd8352a),
  post:     lam(0x555d68),
  bar:      lam(0xd8352a),
  coin:     new THREE.MeshPhongMaterial({ color: conv(0xffce2e), emissive: conv(0x7a4c00),
              specular: conv(0xfff2b0), shininess: 90 }),
  skin:     lam(0xe8b58a),
  board:    new THREE.MeshLambertMaterial({ color: conv(0x28e0c0), emissive: conv(0x0a5c4d) }),
};

var trainColors = [0xc93030, 0x2f6fd0, 0x2f9e50, 0xe0761f, 0x8a4fc9, 0x3a4750];
var bldgColors  = [0xb5533c, 0xd9975f, 0x4f8a8b, 0x5a6b8c, 0xcdb98f, 0x8c5a7a];

var coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 18);

/* --- procedural textures ------------------------------------------- */
// window grids drawn on white so material.color can tint the walls
var windowTextures = (function () {
  var out = [];
  for (var v = 0; v < 4; v++) {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 4; col++) {
        var x = 10 + col * 30, y = 10 + row * 30;
        var r = Math.random();
        g.fillStyle = r < 0.22 ? "#ffd9a0" :            // catching the sunset
                      r < 0.34 ? "#7e94ad" : "#2c3a4d"; // glass
        g.fillRect(x, y, 18, 22);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x, y + 18, 18, 4);                   // sill shadow
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    out.push(tex);
  }
  return out;
})();

// colorful (original) graffiti pieces for the trackside walls
var graffitiTextures = (function () {
  var out = [], colors = ["#ff4f9a", "#26d07c", "#3fa9ff", "#ffd23f", "#ff7a2e", "#b96bff"];
  for (var v = 0; v < 3; v++) {
    var c = document.createElement("canvas"); c.width = 256; c.height = 64;
    var g = c.getContext("2d");
    g.fillStyle = "#9a9388"; g.fillRect(0, 0, 256, 64);
    g.fillStyle = "rgba(0,0,0,0.08)";
    for (var s = 0; s < 8; s++) g.fillRect(Math.random() * 256, 0, 2, 64);
    for (var b = 0; b < 5; b++) {
      var x = 12 + Math.random() * 200, y = 12 + Math.random() * 26;
      var w = 24 + Math.random() * 46, h = 14 + Math.random() * 22;
      g.strokeStyle = "#22222e"; g.lineWidth = 5;
      g.fillStyle = colors[(Math.random() * colors.length) | 0];
      g.beginPath();
      g.ellipse(x, y + h / 2, w / 2, h / 2, (Math.random() - 0.5) * 0.5, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath(); g.ellipse(x - w * 0.15, y + h * 0.3, w * 0.14, h * 0.16, 0, 0, Math.PI * 2); g.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    out.push(tex);
  }
  return out;
})();

/* ------------------------------------------------------------------ *
 *  Static / recycled environment
 * ------------------------------------------------------------------ */
// ballast slab + rails are long static strips; motion is sold by the ties,
// fences and buildings streaming toward the camera.
(function buildStatic() {
  var slab = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.3, 320), MAT.ballast);
  slab.position.set(0, -0.15, -130);
  slab.receiveShadow = true;
  scene.add(slab);
  var side = new THREE.Mesh(new THREE.BoxGeometry(30, 0.28, 320), lam(0x7d7365));
  side.position.set(-19, -0.16, -130); side.receiveShadow = true; scene.add(side);
  side = side.clone(); side.position.x = 19; scene.add(side);

  // platform safety lines
  for (var s = -1; s <= 1; s += 2) {
    var line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 320), lam(0xe8c93f));
    line.position.set(s * 5.2, 0.02, -130);
    scene.add(line);
  }

  for (var l = 0; l < 3; l++) {
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 320), MAT.rail);
      rail.position.set(LANE_X[l] + s2 * 0.72, 0.06, -130);
      scene.add(rail);
    }
  }
  // warm evening clouds
  for (var i = 0; i < 7; i++) {
    var cl = new THREE.Mesh(new THREE.BoxGeometry(9 + Math.random() * 10, 1.4, 3),
      new THREE.MeshBasicMaterial({ color: 0xffe2c4, fog: false, transparent: true, opacity: 0.45 }));
    cl.position.set(-70 + Math.random() * 140, 42 + Math.random() * 20, -200 - Math.random() * 60);
    scene.add(cl);
  }
  // distant skyline silhhouettes, mostly swallowed by the haze
  for (i = 0; i < 16; i++) {
    var hgt = 18 + Math.random() * 34;
    var far = new THREE.Mesh(new THREE.BoxGeometry(10 + Math.random() * 14, hgt, 10), lam(0x5a6b8c));
    var sd = Math.random() < 0.5 ? -1 : 1;
    far.position.set(sd * (34 + Math.random() * 40), hgt / 2, -90 - Math.random() * 90);
    scene.add(far);
  }
})();

var ties = [];
(function buildTies() {
  var g = new THREE.BoxGeometry(10.6, 0.1, 0.55);
  for (var i = 0; i < 90; i++) {
    var t = new THREE.Mesh(g, MAT.tie);
    t.position.set(0, 0.01, 14 - i * 2.4);
    t.receiveShadow = true;
    scene.add(t); ties.push(t);
  }
})();

// trackside concrete walls, some tagged with graffiti
var fences = [];
(function buildFences() {
  var g = new THREE.BoxGeometry(0.35, 2.1, 11);
  for (var i = 0; i < 22; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var mat = (i + (s > 0 ? 1 : 0)) % 3 === 0
        ? new THREE.MeshLambertMaterial({ map: graffitiTextures[(Math.random() * 3) | 0] })
        : MAT.wall;
      var f = new THREE.Mesh(g, mat);
      f.position.set(s * 6.4, 1.05, 16 - i * 12);
      f.receiveShadow = true;
      f.castShadow = true;
      scene.add(f); fences.push(f);
    }
  }
})();

var buildings = [];
function styleBuilding(b) {
  var w = 7 + Math.random() * 8, h = 8 + Math.random() * 22, d = 12 + Math.random() * 10;
  b.scale.set(w, h, d);
  b.position.y = h / 2 - 0.2;
  b.material.color.copy(conv(bldgColors[(Math.random() * bldgColors.length) | 0]));
  b.material.map.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
}
(function buildBuildings() {
  var g = new THREE.BoxGeometry(1, 1, 1);
  for (var i = 0; i < 16; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var tex = windowTextures[(Math.random() * windowTextures.length) | 0].clone();
      tex.needsUpdate = true;
      var b = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
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
var LEAN = 0.14;   // forward sprint lean of the torso group

function buildRunner(opts) {
  var body = new THREE.Group();           // rotates for the somersault / lean
  var g = new THREE.Group();              // world placement
  g.add(body);
  body.rotation.x = LEAN;

  var shirt = lam(opts.shirt), pants = lam(opts.pants),
      shoes = lam(opts.shoes), capM = lam(opts.cap);
  var beefy = opts.beefy ? 1.18 : 1;

  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * beefy, 0.37 * beefy, 0.74, 10), shirt);
  torso.position.y = 1.14; body.add(torso);
  var hips = new THREE.Mesh(new THREE.BoxGeometry(0.44 * beefy, 0.2, 0.32), pants);
  hips.position.y = 0.74; body.add(hips);
  // hood resting on the shoulders
  var hood = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), shirt);
  hood.scale.set(1, 0.55, 0.9);
  hood.position.set(0, 1.56, 0.12); body.add(hood);

  var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), MAT.skin);
  head.position.y = 1.88; body.add(head);
  var capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.275, 0.14, 12), capM);
  capTop.position.y = 2.06; body.add(capTop);
  var dome = new THREE.Mesh(new THREE.SphereGeometry(0.265, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  dome.position.y = 2.1; body.add(dome);
  var brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), capM);
  brim.position.set(0, 2.02, opts.brimForward ? -0.36 : 0.36);   // backwards cap for the surfer
  body.add(brim);

  if (opts.pack) {
    var pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.2), lam(opts.pack));
    pack.position.set(0, 1.22, 0.32); body.add(pack);
    for (var s = -1; s <= 1; s += 2) {                            // spray cans poking out
      var can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 8),
        lam(s < 0 ? 0xff4f9a : 0x26d07c));
      can.position.set(s * 0.12, 1.55, 0.32); body.add(can);
    }
  }
  if (opts.badge) {
    var badge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.03), lam(0xe8c93f));
    badge.position.set(-0.15, 1.32, -0.35 * beefy); body.add(badge);
  }

  function armAt(sx) {
    var arm = new THREE.Group();
    arm.position.set(sx * 0.44 * beefy, 1.46, 0);
    var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), shirt);
    upper.position.y = -0.19; arm.add(upper);
    var fore = new THREE.Group(); fore.position.y = -0.38;
    fore.rotation.x = -0.85;                                      // pumping elbows
    var lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 4, 8), shirt);
    lower.position.y = -0.15; fore.add(lower);
    var hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), MAT.skin);
    hand.position.y = -0.32; fore.add(hand);
    arm.add(fore);
    arm.rotation.z = sx * -0.12;
    body.add(arm);
    return arm;
  }
  function legAt(sx) {
    var thigh = new THREE.Group();
    thigh.position.set(sx * 0.16, 0.8, 0);
    var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.28, 4, 8), pants);
    upper.position.y = -0.18; thigh.add(upper);
    var shin = new THREE.Group(); shin.position.y = -0.4;
    var lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 4, 8), pants);
    lower.position.y = -0.15; shin.add(lower);
    var shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.3), shoes);
    shoe.position.set(0, -0.33, -0.05); shin.add(shoe);
    thigh.add(shin);
    body.add(thigh);
    return { thigh: thigh, shin: shin };
  }

  var armL = armAt(-1), armR = armAt(1);
  var legL = legAt(-1), legR = legAt(1);

  g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
  return { group: g, body: body,
           armL: armL, armR: armR,
           thighL: legL.thigh, shinL: legL.shin,
           thighR: legR.thigh, shinR: legR.shin };
}

function animateRun(r, phase, amp) {
  var s = Math.sin(phase);
  r.armL.rotation.x = -s * amp * 0.9;
  r.armR.rotation.x =  s * amp * 0.9;
  r.thighL.rotation.x =  s * amp;
  r.thighR.rotation.x = -s * amp;
  // knees bend as each leg swings through recovery
  r.shinL.rotation.x = -Math.max(0, Math.sin(phase + 2.2)) * amp * 1.15;
  r.shinR.rotation.x = -Math.max(0, Math.sin(phase + 2.2 + Math.PI)) * amp * 1.15;
  r.body.position.y = Math.abs(Math.cos(phase)) * 0.05;
}

function poseAirborne(r) {
  r.thighL.rotation.x = 1.2;  r.shinL.rotation.x = -1.9;   // lead knee tucked
  r.thighR.rotation.x = -0.3; r.shinR.rotation.x = -0.5;
  r.armL.rotation.x = 2.4;    r.armR.rotation.x = 2.1;     // arms flung up
  r.body.position.y = 0;
}

var player = buildRunner({
  shirt: 0x00a8d8, pants: 0x35508f, shoes: 0xf2f2f2,
  cap: 0xe23a3a, pack: 0xe0a92d, brimForward: false,
});
scene.add(player.group);

var board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 1.5), MAT.board);
board.visible = false;
board.castShadow = true;
scene.add(board);

// the inspector + dog, chasing behind
var guard = buildRunner({
  shirt: 0x2b3a63, pants: 0x1f2a47, shoes: 0x22252a,
  cap: 0x2b3a63, brimForward: true, beefy: true, badge: true,
});
scene.add(guard.group);

var dog = (function () {
  var g = new THREE.Group();
  var fur = lam(0x8a6034), dark = lam(0x5c3f20);
  var b = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), fur);
  b.rotation.x = Math.PI / 2; b.position.y = 0.42; g.add(b);
  var h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
  h.position.set(0, 0.6, -0.42); g.add(h);
  var snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), dark);
  snout.position.set(0, 0.55, -0.58); g.add(snout);
  for (var s = -1; s <= 1; s += 2) {
    var ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.04), dark);
    ear.position.set(s * 0.1, 0.75, -0.4); ear.rotation.z = s * -0.25; g.add(ear);
  }
  var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), lam(0xd8352a));
  collar.rotation.x = 0.5; collar.position.set(0, 0.56, -0.32); g.add(collar);
  var tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), dark);
  tail.position.set(0, 0.55, 0.36); tail.rotation.x = -0.7; g.add(tail);
  for (var i = 0; i < 4; i++) {
    var leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.18, 4, 6), fur);
    leg.position.set(i % 2 ? 0.11 : -0.11, 0.16, i < 2 ? -0.22 : 0.24);
    g.add(leg);
  }
  g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
  g.userData.tail = tail;
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
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  g.add(bodyMesh);
  var roof = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 - 0.16, 0.14, bodyLen - 0.2), lam(0xb8bdc4));
  roof.position.set(0, TRAIN_H + 0.07, bodyMesh.position.z);
  roof.receiveShadow = true;
  g.add(roof);
  // dark under-skirt grounds the car visually
  var skirt = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.06, 0.5, bodyLen - 0.3),
    lam(0x23262b));
  skirt.position.set(0, 0.25, bodyMesh.position.z);
  g.add(skirt);
  // white livery stripe
  var stripe = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.05, 0.24, bodyLen - 0.4),
    lam(0xf2ede4));
  stripe.position.set(0, 1.05, bodyMesh.position.z);
  g.add(stripe);
  // window band, tinted by the sunset
  var win = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.04, 0.55, bodyLen - 1),
    new THREE.MeshLambertMaterial({ color: conv(0x2c3e50), emissive: conv(0x8a5a30),
      emissiveIntensity: 0.25 }));
  win.position.set(0, TRAIN_H * 0.66, bodyMesh.position.z);
  g.add(win);
  // sliding doors
  var doorMat = new THREE.MeshLambertMaterial({ color: shade(color, 0.62) });
  var nDoors = Math.max(1, Math.round(bodyLen / 7));
  for (var d = 0; d < nDoors; d++) {
    for (var sSign = -1; sSign <= 1; sSign += 2) {
      var door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 1.1), doorMat);
      door.position.set(sSign * (TRAIN_W + 0.02), 1.15,
        bodyMesh.position.z - bodyLen / 2 + (d + 0.5) * (bodyLen / nDoors));
      g.add(door);
    }
  }
  if (opts.ramp) {
    // sloped tail the runner can sprint up
    var ramp = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2, 0.25, Math.hypot(RAMP_LEN, TRAIN_H) + 0.4), lam(0x777d85));
    ramp.position.set(0, TRAIN_H / 2, len / 2 - RAMP_LEN / 2);
    ramp.rotation.x = Math.atan2(TRAIN_H, RAMP_LEN);
    ramp.castShadow = ramp.receiveShadow = true;
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
  g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
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
  g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
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
  var core = new THREE.Group();
  var glow = new THREE.MeshLambertMaterial({ color: conv(def.color),
    emissive: conv(def.color), emissiveIntensity: 0.4 });
  var chrome = lam(0xd8dde6);

  if (type === "magnet") {                       // horseshoe magnet
    var u = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 8, 14, Math.PI), glow);
    u.rotation.z = Math.PI; core.add(u);
    for (var s = -1; s <= 1; s += 2) {
      var tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), chrome);
      tip.position.set(s * 0.26, 0.08, 0); core.add(tip);
    }
  } else if (type === "sneakers") {              // springy sneaker
    var sole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.56), chrome);
    sole.position.y = -0.12; core.add(sole);
    var upper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.4), glow);
    upper.position.set(0, 0.03, 0.05); core.add(upper);
    var cuff = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.18), glow);
    cuff.position.set(0, 0.18, 0.16); core.add(cuff);
  } else if (type === "mult") {                  // score gem
    core.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.34), glow));
  } else {                                       // jetpack
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.44, 10), glow);
      tank.position.x = s2 * 0.13; core.add(tank);
      var nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 8), chrome);
      nozzle.rotation.x = Math.PI; nozzle.position.set(s2 * 0.13, -0.29, 0); core.add(nozzle);
      var flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      flame.rotation.x = Math.PI; flame.position.set(s2 * 0.13, -0.44, 0); core.add(flame);
    }
  }
  core.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
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
var actx = null, musicGain = null, musicOn = true, musicTimer = null;
function audio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      musicGain = actx.createGain();
      musicGain.gain.value = 1;
      musicGain.connect(actx.destination);
    } catch (e) {}
  }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function beep(freq, dur, type, vol, slideTo, when, toMusic) {
  var ctx = audio(); if (!ctx) return;
  var t = when || ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || "square";
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(toMusic ? musicGain : ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
var noiseBuf = null;
function noiseHit(dur, filterType, filterFreq, vol, when) {
  var ctx = audio(); if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  var t = when || ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = noiseBuf;
  var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = filterFreq;
  var g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(musicGain);
  src.start(t); src.stop(t + dur + 0.02);
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
/* Original generative chiptune: a 4-bar chord loop (Am–F–C–G) with a
   pentatonic lead whose phrases reshuffle every loop, over kick/snare/hats.
   A lookahead scheduler keeps timing sample-accurate. */
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

var PROG = [                          // per-bar: bass root (midi) + stab chord
  { bass: 45, chord: [57, 60, 64] },  // Am
  { bass: 41, chord: [53, 57, 60] },  // F
  { bass: 48, chord: [55, 60, 64] },  // C
  { bass: 43, chord: [55, 59, 62] },  // G
];
var BASS_STEPS = [0, 0, 12, 0, 0, 7, 0, 12];       // octave/fifth pops on the root
var PHRASES = [                                    // A-minor pentatonic, 8 eighth-notes each
  [69,  0, 72, 74,  0, 76, 74, 72],
  [76,  0, 74, 72, 74,  0, 69,  0],
  [79, 76,  0, 74, 76,  0, 72, 74],
  [69, 72, 74, 76, 79,  0, 81, 79],
  [ 0,  0, 76,  0,  0, 74,  0,  0],                // sparse breather
];
var PHRASE_ORDERS = [[0, 1, 0, 2], [0, 3, 1, 2], [2, 1, 4, 3], [0, 1, 3, 4]];
var M_STEP_DUR = 0.165, M_SWING = 0.045;
var mStep = 0, mNext = 0, mLoop = 0, mOrder = PHRASE_ORDERS[0];

function playMusicStep(s, t) {
  var bar = (s / 8) | 0, st = s % 8;
  var pr = PROG[bar];

  // drums
  if (st === 0 || st === 4 || (bar % 2 === 1 && st === 7)) {
    beep(150, 0.11, "sine", 0.12, 45, t, true);                        // kick
  }
  if (st === 2 || st === 6) {
    noiseHit(0.09, "bandpass", 1800, 0.06, t);                         // snare
    beep(190, 0.05, "triangle", 0.025, null, t, true);
  }
  noiseHit(st % 2 === 0 ? 0.03 : 0.02, "highpass", 7000,
           st % 2 === 0 ? 0.02 : 0.011, t);                            // hats
  if (st === 7 && bar === 3) noiseHit(0.12, "highpass", 6000, 0.02, t); // open hat turnaround

  // bass
  beep(mtof(pr.bass + BASS_STEPS[st]), 0.15, "triangle", 0.08, null, t, true);

  // chord stabs on the off-beats
  if (st === 0 || st === 3) {
    for (var i = 0; i < pr.chord.length; i++) {
      beep(mtof(pr.chord[i]), 0.09, "sawtooth", 0.013, null, t, true);
    }
  }

  // lead (skip the first loop so the song builds)
  if (mLoop > 0) {
    var n = PHRASES[mOrder[bar]][st];
    if (n) {
      beep(mtof(n), 0.15, "square", 0.028, null, t, true);
      beep(mtof(n + 12), 0.15, "triangle", 0.018, null, t, true);      // sparkle octave
    }
  }
}

function scheduleMusic() {
  if (!actx || !musicOn || state !== "running") return;
  var now = actx.currentTime;
  if (mNext < now - 0.4) mNext = now + 0.05;       // resync after a pause
  while (mNext < now + 0.35) {
    playMusicStep(mStep, mNext + (mStep % 2 ? M_SWING : 0));
    mStep = (mStep + 1) % 32;
    if (mStep === 0) {
      mLoop++;
      mOrder = PHRASE_ORDERS[mLoop % PHRASE_ORDERS.length];
    }
    mNext += M_STEP_DUR;
  }
}

function toggleMusic() {
  musicOn = !musicOn;
  if (musicGain) musicGain.gain.value = musicOn ? 1 : 0;
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
  guardZ = 3.2; boardT = 0;
  mStep = 0; mNext = 0; mLoop = 0;
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
  musicTimer = setInterval(scheduleMusic, 90);
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
    case "m": case "M": toggleMusic(); break;
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

  if (state === "dying") {
    // tumble over
    player.body.rotation.x -= 9 * dt;
    player.group.position.z += 3.5 * dt;
  } else if (rollT > 0) {
    player.body.rotation.x = LEAN - (1 - rollT / ROLL_TIME) * Math.PI * 2;
    player.body.scale.y = 0.55;
  } else {
    player.body.rotation.x = LEAN;
    player.body.scale.y = 1;
    if (!grounded && pu.jetpack <= 0) {
      poseAirborne(player);
    } else {
      runPhase += speed * dt * 0.85;
      animateRun(player, runPhase, 1.05);
    }
  }
  // the dog's happy tail
  dog.userData.tail.rotation.y = Math.sin(performance.now() / 90) * 0.5;
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
