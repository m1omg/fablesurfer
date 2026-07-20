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
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

var SKY_TOP = 0x1f6fd4, SKY_BOT = 0x9fd4f5, FOG_COL = 0xa9d6f0;

var scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_BOT);
scene.fog = new THREE.Fog(FOG_COL, 120, 320);

// gradient sky dome — sells a sunny outdoor sky instead of a flat fill
(function buildSky() {
  var mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(SKY_TOP) },
                bot: { value: new THREE.Color(SKY_BOT) } },
    vertexShader:
      "varying vec3 vP; void main(){ vP = position;" +
      "gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "varying vec3 vP; uniform vec3 top; uniform vec3 bot;" +
      "void main(){ float h = clamp(normalize(vP).y*0.5+0.5,0.0,1.0);" +
      "gl_FragColor = vec4(mix(bot, top, pow(h,0.7)), 1.0); }"
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), mat);
  scene.add(sky);
})();

var camera = new THREE.PerspectiveCamera(68, 1, 0.1, 600);
camera.position.set(0, 5, 8.2);

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x6a5a40, 0.62));
scene.add(new THREE.AmbientLight(0xffffff, 0.1));
var sun = new THREE.DirectionalLight(0xfff2d6, 1.7);
sun.position.set(22, 46, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 8;
sun.shadow.camera.far = 130;
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 26;  sun.shadow.camera.bottom = -34;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
sun.target.position.set(0, 0, -22);
scene.add(sun); scene.add(sun.target);

// mark a mesh (and its children) as shadow casters / receivers
function shadowify(obj, cast, receive) {
  obj.traverse(function (n) {
    if (n.isMesh) { n.castShadow = !!cast; n.receiveShadow = !!receive; }
  });
  return obj;
}

/* ------------------------------------------------------------------ *
 *  Shared materials / geometries
 * ------------------------------------------------------------------ */
function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
// slightly glossy standard material for hero surfaces that should catch the sun
function std(c, rough, metal) {
  return new THREE.MeshStandardMaterial({ color: c,
    roughness: rough == null ? 0.75 : rough, metalness: metal || 0 });
}

var MAT = {
  ballast:  lam(0x6b6459),
  tie:      lam(0x4a3b2e),
  rail:     std(0xd2d6de, 0.35, 0.85),
  fence:    lam(0x9aa3ad),
  hurdleW:  std(0xf0b53f, 0.6, 0.1),
  hurdleS:  std(0xe0463a, 0.6, 0.1),
  post:     std(0x7a828c, 0.5, 0.6),
  bar:      std(0xe0463a, 0.6, 0.1),
  coin:     new THREE.MeshStandardMaterial({ color: 0xffcf1f, emissive: 0xffae00,
              emissiveIntensity: 0.45, roughness: 0.28, metalness: 0.9 }),
  coinStar: new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffd24d,
              emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.7 }),
  skin:     lam(0xf0bd93),
  board:    new THREE.MeshStandardMaterial({ color: 0x2ee6c4, emissive: 0x0c6d5b,
              emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 }),
  trunk:    lam(0x7a5230),
  leafA:    lam(0x4aa838),
  leafB:    lam(0x358a3a),
  wire:     lam(0x24242a),
  grass:    lam(0x5ea63c),
  window:   new THREE.MeshBasicMaterial({ color: 0xfff4c2 }),
};

var trainColors = [
  { body: 0xe23b3b, trim: 0xffd23f }, // classic red
  { body: 0x2f7fe0, trim: 0xdff0ff }, // blue
  { body: 0x36b558, trim: 0xf4ffe0 }, // green
  { body: 0xf0a02d, trim: 0x7a3d00 }, // orange/yellow
  { body: 0x9a5fd0, trim: 0xffe6ff }, // purple
  { body: 0xccd3de, trim: 0x2f7fe0 }, // silver commuter
];
var bldgColors  = [0xc9a06a, 0x7fa8d0, 0xc98fb0, 0x9cc471, 0xcf7f6a, 0x8a94a3];

// a coin: gold disc with a raised star face, built once and cloned
var coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 20);
var coinStarShape = (function () {
  var s = new THREE.Shape();
  for (var i = 0; i < 10; i++) {
    var r = i % 2 ? 0.1 : 0.22, a = Math.PI / 2 + i * Math.PI / 5;
    var x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
})();

// procedural window façade texture (built once per building, reused on recycle)
function makeWindowTexture() {
  var c = document.createElement("canvas"); c.width = 128; c.height = 128;
  var x = c.getContext("2d");
  x.fillStyle = "#ded6c6"; x.fillRect(0, 0, 128, 128);
  var cols = 4, rows = 4, m = 12, gap = 8;
  var wv = (128 - m * 2 - gap * (cols - 1)) / cols;
  for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
    var wx = m + i * (wv + gap), wy = m + j * (wv + gap);
    x.fillStyle = "#5b5346"; x.fillRect(wx - 2, wy - 2, wv + 4, wv + 4);
    var lit = Math.random() < 0.35;
    x.fillStyle = lit ? "#ffe7a0" : "#8fbcd6";
    x.fillRect(wx, wy, wv, wv);
    x.fillStyle = "rgba(255,255,255,0.28)";
    x.fillRect(wx, wy, wv * 0.55, wv * 0.42);
  }
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------------------------ *
 *  Static / recycled environment
 * ------------------------------------------------------------------ */
// ballast slab + rails are long static strips; motion is sold by the ties,
// fences and buildings streaming toward the camera.
(function buildStatic() {
  var slab = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.3, 340), MAT.ballast);
  slab.position.set(0, -0.15, -140);
  slab.receiveShadow = true;
  scene.add(slab);
  // grassy verges either side of the trackbed
  var verge = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 340), MAT.grass);
  verge.position.set(-20.5, -0.18, -140); verge.receiveShadow = true; scene.add(verge);
  verge = verge.clone(); verge.position.x = 20.5; scene.add(verge);

  for (var l = 0; l < 3; l++) {
    for (var s = -1; s <= 1; s += 2) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 340), MAT.rail);
      rail.position.set(LANE_X[l] + s * 0.72, 0.07, -140);
      scene.add(rail);
    }
  }
  // catenary wires strung the length of the track, high overhead
  for (var w = -1; w <= 1; w += 2) {
    var wire = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 340), MAT.wire);
    wire.position.set(w * 3.1, 6.3, -140); scene.add(wire);
  }
  var midwire = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 340), MAT.wire);
  midwire.position.set(0, 6.5, -140); scene.add(midwire);

  // soft puffy clouds
  var cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false });
  for (var i = 0; i < 9; i++) {
    var cloud = new THREE.Group();
    var puffs = 3 + (Math.random() * 3 | 0);
    for (var p = 0; p < puffs; p++) {
      var puff = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + Math.random() * 2.2, 0), cloudMat);
      puff.position.set((p - puffs / 2) * 2.6 + Math.random(), Math.random() * 1.2, Math.random() * 2);
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    cloud.position.set(-90 + Math.random() * 180, 34 + Math.random() * 16, -150 - Math.random() * 90);
    scene.add(cloud);
  }
})();

var ties = [];
(function buildTies() {
  var g = new THREE.BoxGeometry(10.6, 0.12, 0.55);
  for (var i = 0; i < 90; i++) {
    var t = new THREE.Mesh(g, MAT.tie);
    t.position.set(0, 0.02, 14 - i * 2.4);
    t.receiveShadow = true;
    scene.add(t); ties.push(t);
  }
})();

var fences = [];
(function buildFences() {
  var g = new THREE.BoxGeometry(0.22, 1.2, 11);
  for (var i = 0; i < 22; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var f = new THREE.Mesh(g, MAT.fence);
      f.position.set(s * 6.4, 0.6, 16 - i * 12);
      f.castShadow = true;
      scene.add(f); fences.push(f);
    }
  }
})();

// overhead gantries (posts + crossbeam) that stream toward the camera
var gantries = [];
var GANTRY_SPAN = 24, GANTRY_N = 14;
(function buildGantries() {
  var postGeo = new THREE.BoxGeometry(0.3, 6.8, 0.3);
  var beamGeo = new THREE.BoxGeometry(11.4, 0.28, 0.3);
  for (var i = 0; i < GANTRY_N; i++) {
    var g = new THREE.Group();
    for (var s = -1; s <= 1; s += 2) {
      var post = new THREE.Mesh(postGeo, MAT.post);
      post.position.set(s * 5.4, 3.4, 0); post.castShadow = true;
      g.add(post);
    }
    var beam = new THREE.Mesh(beamGeo, MAT.post);
    beam.position.y = 6.6; beam.castShadow = true; g.add(beam);
    g.position.z = 16 - i * GANTRY_SPAN;
    scene.add(g); gantries.push(g);
  }
})();

// leafy trees dotted along both grass verges
var trees = [];
var TREE_SPAN = 15, TREE_N = 20;
function styleTree(t) {
  var s = 0.8 + Math.random() * 0.9;
  t.scale.set(s, s, s);
  t.position.x = (7.5 + Math.random() * 9) * (Math.random() < 0.5 ? -1 : 1);
  t.rotation.y = Math.random() * 6.28;
}
(function buildTrees() {
  var trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
  for (var i = 0; i < TREE_N; i++) {
    var t = new THREE.Group();
    var trunk = new THREE.Mesh(trunkGeo, MAT.trunk);
    trunk.position.y = 1.1; trunk.castShadow = true; t.add(trunk);
    for (var b = 0; b < 3; b++) {
      var leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + Math.random() * 0.5, 0),
        b % 2 ? MAT.leafB : MAT.leafA);
      leaf.position.set((Math.random() - 0.5) * 1.1, 2.4 + b * 0.7, (Math.random() - 0.5) * 1.1);
      leaf.castShadow = true; t.add(leaf);
    }
    styleTree(t);
    t.position.z = 12 - i * TREE_SPAN;
    scene.add(t); trees.push(t);
  }
})();

var buildings = [];
function styleBuilding(b) {
  var w = 7 + Math.random() * 9, h = 11 + Math.random() * 24, d = 12 + Math.random() * 10;
  b.scale.set(w, h, d);
  b.position.y = h / 2 - 0.2;
  b.material.color.setHex(bldgColors[(Math.random() * bldgColors.length) | 0]);
  if (b.material.map) {
    b.material.map.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(2, Math.round(h / 4)));
  }
}
(function buildBuildings() {
  var g = new THREE.BoxGeometry(1, 1, 1);
  for (var i = 0; i < 16; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var b = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: makeWindowTexture() }));
      b.castShadow = true;
      styleBuilding(b);
      b.position.x = s * (14.5 + Math.random() * 6);
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

  // hands + trainers, parented to the limbs so they swing with the run cycle
  var shoeMat = lam(opts.shoe || 0xf4f4f4);
  [armL, armR].forEach(function (arm) {
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), MAT.skin);
    hand.position.set(0, -0.66, 0); arm.add(hand);
  });
  [legL, legR].forEach(function (leg) {
    var shoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.17, 0.42), shoeMat);
    shoe.position.set(0, -0.82, 0.08); leg.add(shoe);
  });

  return { group: g, body: body, armL: armL, armR: armR, legL: legL, legR: legR };
}

function animateRun(r, phase, amp) {
  r.armL.rotation.x =  Math.sin(phase) * amp;
  r.armR.rotation.x = -Math.sin(phase) * amp;
  r.legL.rotation.x = -Math.sin(phase) * amp;
  r.legR.rotation.x =  Math.sin(phase) * amp;
}

var player = buildRunner({ shirt: 0x00b8e6, pants: 0x2d4a8a, cap: 0xe23a3a, pack: 0xe0a92d, shoe: 0xf4f4f4 });
scene.add(shadowify(player.group, true, false));

var blob = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.55, 0.02, 16),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
scene.add(blob);

var board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 1.5), MAT.board);
board.visible = false;
board.castShadow = true;
scene.add(board);

// the inspector + dog, chasing behind
var guard = buildRunner({ shirt: 0x2a3b66, pants: 0x1c2846, cap: 0x2a3b66, pack: 0x1c2846, shoe: 0x14203a });
scene.add(shadowify(guard.group, true, false));
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
  scene.add(shadowify(g, true, false));
  return g;
})();

/* ------------------------------------------------------------------ *
 *  Obstacle / pickup construction
 * ------------------------------------------------------------------ */
var obstacles = [], coins = [], powerups = [];

function makeTrain(lane, z, len, opts) {
  var pal = trainColors[(Math.random() * trainColors.length) | 0];
  var bodyMat = std(pal.body, 0.5, 0.18);
  var trimMat = std(pal.trim, 0.5, 0.1);
  var g = new THREE.Group();
  var W = TRAIN_W * 2;
  var bodyLen = opts.ramp ? len - RAMP_LEN : len;
  var bz = opts.ramp ? -RAMP_LEN / 2 : 0;

  var bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(W, TRAIN_H, bodyLen), bodyMat);
  bodyMesh.position.set(0, TRAIN_H / 2, bz);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  // roof cap + a couple of air-con units, for silhouette
  var roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.34, 0.18, bodyLen - 0.3), lam(0xdadde2));
  roof.position.set(0, TRAIN_H + 0.03, bz); roof.castShadow = true; g.add(roof);
  for (var r = -1; r <= 1; r += 2) {
    var ac = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.1), lam(0xb4b8be));
    ac.position.set(0, TRAIN_H + 0.18, bz + r * bodyLen * 0.26); ac.castShadow = true; g.add(ac);
  }

  // window band with dark glass, lower colour stripe, and doors
  var winStrip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.66, bodyLen - 1.2), trimMat);
  winStrip.position.set(0, TRAIN_H * 0.66, bz); g.add(winStrip);
  var glass = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.46, bodyLen - 1.7),
    new THREE.MeshStandardMaterial({ color: 0x22323e, roughness: 0.12, metalness: 0.4 }));
  glass.position.set(0, TRAIN_H * 0.66, bz); g.add(glass);
  var stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.22, bodyLen - 0.4), trimMat);
  stripe.position.set(0, TRAIN_H * 0.24, bz); g.add(stripe);

  var nDoors = Math.max(1, Math.round(bodyLen / 6));
  var doorMat = std(0x2b3138, 0.55, 0.1);
  for (var d = 0; d < nDoors; d++) {
    var doorZ = bz - bodyLen / 2 + (d + 0.5) * (bodyLen / nDoors);
    var door = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, TRAIN_H * 0.72, 0.9), doorMat);
    door.position.set(0, TRAIN_H * 0.42, doorZ); g.add(door);
  }

  // cab face on the camera-facing end: windshield + headlights (skip on ramp cars)
  var frontZ = bz + bodyLen / 2;
  if (!opts.ramp) {
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.72, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x1e2c37, roughness: 0.12, metalness: 0.45 }));
    windshield.position.set(0, TRAIN_H * 0.72, frontZ + 0.02); g.add(windshield);
  }
  for (var s = -1; s <= 1; s += 2) {
    var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.12),
      new THREE.MeshBasicMaterial({ color: opts.moving ? 0xfff6b0 : 0xffd24d }));
    hl.position.set(s * (TRAIN_W - 0.36), 0.72, frontZ + 0.05); g.add(hl);
  }

  if (opts.ramp) {
    // sloped tail the runner can sprint up
    var ramp = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.28, Math.hypot(RAMP_LEN, TRAIN_H) + 0.4), std(0x8a9099, 0.7, 0.3));
    ramp.position.set(0, TRAIN_H / 2, len / 2 - RAMP_LEN / 2);
    ramp.rotation.x = Math.atan2(TRAIN_H, RAMP_LEN);
    ramp.castShadow = true;
    g.add(ramp);
  }
  if (opts.moving) {
    var beam = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.4, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xfff6b0 }));
    beam.position.set(0, 1.15, len / 2 + 0.05);
    g.add(beam);
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
  scene.add(shadowify(g, true, false));
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
  scene.add(shadowify(g, true, false));
  obstacles.push({ kind: "overhang", mesh: g, lane: lane, halfLen: 0.28, moving: 0 });
}

function makeCoin(lane, z, y) {
  var g = new THREE.Group();
  var c = new THREE.Mesh(coinGeo, MAT.coin);
  c.rotation.x = Math.PI / 2;
  g.add(c);
  var starF = new THREE.Mesh(coinStarShape, MAT.coinStar); starF.position.z = 0.05; g.add(starF);
  var starB = new THREE.Mesh(coinStarShape, MAT.coinStar); starB.position.z = -0.09; g.add(starB);
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
var actx = null, master = null, musicOn = true, musicTimer = null, musicBeat = 0;
function audio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      // master bus: gain into a soft compressor so it's loud but never clips
      master = actx.createGain();
      master.gain.value = 0.95;
      var comp = actx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 26; comp.ratio.value = 5;
      master.connect(comp); comp.connect(actx.destination);
    } catch (e) {}
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
  g.gain.setValueAtTime(0.0008, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);   // quick attack
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master || ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
var sfx = {
  coin:    function () { beep(1180, 0.09, "square", 0.32, 1580); },
  jump:    function () { beep(320, 0.18, "sine", 0.5, 660); },
  roll:    function () { beep(230, 0.16, "triangle", 0.42, 90); },
  powerup: function () { var c = audio(); if (!c) return;
             [660, 880, 1320, 1760].forEach(function (f, i) {
               beep(f, 0.13, "square", 0.36, null, c.currentTime + i * 0.06); }); },
  board:   function () { beep(140, 0.4, "sawtooth", 0.38, 300); },
  stumble: function () { beep(150, 0.2, "sawtooth", 0.55, 70); },
  crash:   function () { beep(190, 0.45, "sawtooth", 0.7, 35); beep(90, 0.55, "square", 0.5, 30); },
};
// two-bar chiptune: bass + kick + hat + a bouncy lead melody
var BASS = [110, 110, 165, 110, 131, 131, 98, 123];
var LEAD = [440, 0, 523, 659, 0, 587, 494, 0, 440, 523, 0, 659, 784, 0, 587, 494];
function musicTick() {
  var ctx = audio(); if (!ctx || !musicOn || state !== "running") return;
  var t = ctx.currentTime;
  beep(BASS[musicBeat % 8], 0.18, "triangle", 0.22, null, t);
  if (musicBeat % 2 === 0) beep(55, 0.12, "sine", 0.5, 38, t);          // kick
  if (musicBeat % 4 === 2) beep(4200, 0.03, "square", 0.09, null, t);   // hat
  var lead = LEAD[musicBeat % LEAD.length];
  if (lead) beep(lead, 0.15, "square", 0.16, null, t);                  // melody
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
  gantries.forEach(function (gn) {
    gn.position.z += dz;
    if (gn.position.z > 24) gn.position.z -= GANTRY_SPAN * GANTRY_N;
  });
  trees.forEach(function (tr) {
    tr.position.z += dz;
    if (tr.position.z > 26) { tr.position.z -= TREE_SPAN * TREE_N; styleTree(tr); }
  });
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
