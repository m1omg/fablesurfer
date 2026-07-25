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
(function brightDaySky() {
  var c = document.createElement("canvas"); c.width = 16; c.height = 256;
  var g2 = c.getContext("2d");
  var gr = g2.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.00, "#1e7fe0");
  gr.addColorStop(0.45, "#45a4ef");
  gr.addColorStop(0.75, "#8dd0f7");
  gr.addColorStop(1.00, "#c9ecfb");
  g2.fillStyle = gr; g2.fillRect(0, 0, 16, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  scene.background = tex;
})();
scene.fog = new THREE.Fog(conv(0xa9d7f2), 55, 150);

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

scene.add(new THREE.HemisphereLight(conv(0xbfe0ff), conv(0x8a7a58), 0.95));
var sun = new THREE.DirectionalLight(conv(0xfff2d8), 1.25);
sun.position.set(-22, 42, -18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 60;  sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 2;  sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

/* ------------------------------------------------------------------ *
 *  Generated textures (js/textures.js → window.FS_TEX data URIs).
 *  Everything degrades to flat colors if the file didn't load.
 * ------------------------------------------------------------------ */
var GEN = window.FS_TEX || {};
function genTex(name, rx, ry) {
  if (!GEN[name]) return null;
  var tex = new THREE.TextureLoader().load(GEN[name]);
  tex.encoding = THREE.sRGBEncoding;
  if (rx) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry || rx);
  }
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
// load once, share everywhere (clone + own repeat where needed)
var brickImg = null;                  // <img> for canvas compositing
if (GEN.brick) { brickImg = new Image(); brickImg.src = GEN.brick; }
var graffitiImg = null;
if (GEN.graffiti) { graffitiImg = new Image(); graffitiImg.src = GEN.graffiti; }
// the HUD coin icon reuses the generated coin face
if (GEN.coin) {
  var coinIconEl = $("coin-icon");
  coinIconEl.style.background = "url(" + GEN.coin + ") center / contain no-repeat";
  coinIconEl.style.boxShadow = "none";
}

/* ------------------------------------------------------------------ *
 *  Shared materials / geometries
 * ------------------------------------------------------------------ */
function lam(c) { return new THREE.MeshLambertMaterial({ color: conv(c) }); }
function shade(c, f) { return conv(c).multiplyScalar(f); }

var MAT = {
  ballast:  (function () {
    var t = genTex("gravel", 6, 56);
    return t ? new THREE.MeshLambertMaterial({ map: t })
             : lam(0x9a7a52);
  })(),
  tie:      lam(0x8a5a30),
  rail:     new THREE.MeshPhongMaterial({ color: conv(0xdce4ee),
              specular: conv(0xbfd8f0), shininess: 60 }),
  hurdleW:  lam(0xe8a72e),
  hurdleS:  lam(0xd8352a),
  hurdleWhite: lam(0xf2ede4),
  post:     lam(0x4a5568),
  bar:      lam(0xd8352a),
  coin:     new THREE.MeshPhongMaterial({ color: conv(0xffce2e), emissive: conv(0x7a4c00),
              specular: conv(0xfff2b0), shininess: 90 }),
  skin:     lam(0xe8b58a),
  board:    new THREE.MeshLambertMaterial({ color: conv(0x28e0c0), emissive: conv(0x0a5c4d) }),
};

// livery palettes in the spirit of the classic subway cars:
// [body, skirt, stripe, roof]
var trainLiveries = [
  { body: 0x5b7fa6, skirt: 0x2c3a4d, stripe: 0xf2ede4, roof: 0xb8c2cc },   // blue-grey metro
  { body: 0xf2ede8, skirt: 0x3a4750, stripe: 0xe8352a, roof: 0xd8dde2 },   // white express
  { body: 0x3fae7a, skirt: 0x1f4a38, stripe: 0xffd23f, roof: 0xcdd6d0 },   // teal-green
  { body: 0xe8b52e, skirt: 0x8a5a10, stripe: 0x2c3e50, roof: 0xd8c9a0 },   // work train
  { body: 0xd0482e, skirt: 0x5c1f14, stripe: 0xf2ede4, roof: 0xc9b8b0 },   // red liner
];
var bldgColors  = [0xb5533c, 0xd9975f, 0x4f8a8b, 0x5a6b8c, 0xcdb98f, 0x8c5a7a];

var coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 18);

// hazard-striped surface for train ramps
var rampMat = (function () {
  var c = document.createElement("canvas"); c.width = c.height = 64;
  var g = c.getContext("2d");
  g.fillStyle = "#e8b52e"; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#3a3f46"; g.lineWidth = 11;
  for (var i = -64; i < 128; i += 32) {
    g.beginPath(); g.moveTo(i, 70); g.lineTo(i + 70, -6); g.stroke();
  }
  var t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  return new THREE.MeshLambertMaterial({ map: t });
})();

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
        g.fillStyle = r < 0.22 ? "#cfe9f8" :            // catching the sky
                      r < 0.34 ? "#7e94ad" : "#33445c"; // glass
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

/* Viaduct wall faces: generated brick composited with arch niches or a
   graffiti piece. Canvas is drawn immediately with flat colors, then
   redrawn (needsUpdate) once the generated images finish decoding. */
function makeWallTexture(variant) {
  var W = 512, H = 256;
  var c = document.createElement("canvas"); c.width = W; c.height = H;
  var g = c.getContext("2d");
  function draw() {
    if (brickImg && brickImg.complete && brickImg.naturalWidth) {
      // brick courses, squashed so bricks read at wall scale
      for (var y = 0; y < H; y += 128) {
        g.drawImage(brickImg, 0, y, W, 128);
        g.drawImage(brickImg, 0, y, W, 128);
      }
    } else {
      g.fillStyle = "#d8703a"; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(0,0,0,0.12)";
      for (var by = 0; by < H; by += 22) g.fillRect(0, by + 20, W, 2);
    }
    if (variant === "arch") {
      // two rounded-top niches with painted depth
      for (var i = 0; i < 2; i++) {
        var cx = W * (0.28 + i * 0.44), aw = W * 0.15, top = H * 0.30, bot = H * 0.995;
        g.fillStyle = "#7a2f16";
        g.beginPath();
        g.moveTo(cx - aw, bot); g.lineTo(cx - aw, top + aw);
        g.arc(cx, top + aw, aw, Math.PI, 0);
        g.lineTo(cx + aw, bot); g.closePath(); g.fill();
        // inner shadow on the left / glow on the right edge
        g.fillStyle = "rgba(0,0,0,0.30)";
        g.fillRect(cx - aw, top + aw, aw * 0.35, bot - top - aw);
        g.fillStyle = "rgba(255,190,140,0.20)";
        g.fillRect(cx + aw * 0.65, top + aw, aw * 0.35, bot - top - aw);
        // brick arch ring
        g.strokeStyle = "#b34a22"; g.lineWidth = 10;
        g.beginPath(); g.arc(cx, top + aw, aw + 5, Math.PI, 0); g.stroke();
      }
    } else if (variant === "graffiti" && graffitiImg && graffitiImg.complete && graffitiImg.naturalWidth) {
      g.drawImage(graffitiImg, W * 0.06, H * 0.34, W * 0.88, H * 0.60);
    }
    // stone coping along the top
    var grad = g.createLinearGradient(0, 0, 0, H * 0.12);
    grad.addColorStop(0, "#f2d9b0"); grad.addColorStop(1, "#cfa878");
    g.fillStyle = grad; g.fillRect(0, 0, W, H * 0.10);
    g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(0, H * 0.10, W, 6);
  }
  draw();
  var tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  var pending = 0;
  [brickImg, graffitiImg].forEach(function (img) {
    if (img && !(img.complete && img.naturalWidth)) {
      pending++;
      img.addEventListener("load", function () {
        if (--pending <= 0) { draw(); tex.needsUpdate = true; }
      });
    }
  });
  return tex;
}
var wallTexArch = makeWallTexture("arch");
var wallTexTag  = makeWallTexture("graffiti");
var wallTexPlain = makeWallTexture("plain");

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
  var side = new THREE.Mesh(new THREE.BoxGeometry(30, 0.28, 320), lam(0xb08a58));
  side.position.set(-19, -0.16, -130); side.receiveShadow = true; scene.add(side);
  side = side.clone(); side.position.x = 19; scene.add(side);

  for (var l = 0; l < 3; l++) {
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 320), MAT.rail);
      rail.position.set(LANE_X[l] + s2 * 0.72, 0.07, -130);
      scene.add(rail);
    }
  }
  // overhead catenary wires, one pair per lane (uniform along z → static).
  // kept well above the camera (y≈5-6) so they project as thin lines
  var wireMat = new THREE.MeshBasicMaterial({ color: 0x20242c });
  for (l = 0; l < 3; l++) {
    var wire = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 320), wireMat);
    wire.position.set(LANE_X[l], 6.6, -130);
    scene.add(wire);
    var wire2 = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 320), wireMat);
    wire2.position.set(LANE_X[l], 7.1, -130);
    scene.add(wire2);
  }
  // puffy white clouds
  for (var i = 0; i < 8; i++) {
    var cl = new THREE.Mesh(new THREE.BoxGeometry(9 + Math.random() * 10, 1.8, 3),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.85 }));
    cl.position.set(-80 + Math.random() * 160, 40 + Math.random() * 24, -200 - Math.random() * 60);
    scene.add(cl);
  }
  // distant skyline silhouettes, mostly swallowed by the haze
  for (i = 0; i < 16; i++) {
    var hgt = 18 + Math.random() * 34;
    var far = new THREE.Mesh(new THREE.BoxGeometry(10 + Math.random() * 14, hgt, 10),
      lam(bldgColors[(Math.random() * bldgColors.length) | 0]));
    var sd = Math.random() < 0.5 ? -1 : 1;
    far.position.set(sd * (36 + Math.random() * 40), hgt / 2, -100 - Math.random() * 80);
    scene.add(far);
  }
})();

var ties = [];
(function buildTies() {
  var g = new THREE.BoxGeometry(10.6, 0.12, 0.62);
  for (var i = 0; i < 90; i++) {
    var t = new THREE.Mesh(g, MAT.tie);
    t.position.set(0, 0.01, 14 - i * 2.4);
    t.receiveShadow = true;
    scene.add(t); ties.push(t);
  }
})();

// tall brick viaduct walls boxing in the tracks, greenery peeking over
var fences = [];
(function buildWalls() {
  var wallGeo = new THREE.BoxGeometry(0.7, 6.4, 12);
  var leafTex = genTex("leaves", 2, 1);
  var leafMats = [0x3fae3a, 0x2f9e50, 0x57c23a].map(function (col) {
    return leafTex
      ? new THREE.MeshLambertMaterial({ map: leafTex, color: conv(col) })
      : lam(col);
  });
  var trunkMat = lam(0x6b4a26);
  var wallMats = [
    new THREE.MeshLambertMaterial({ map: wallTexArch }),
    new THREE.MeshLambertMaterial({ map: wallTexPlain }),
    new THREE.MeshLambertMaterial({ map: wallTexTag }),
  ];
  for (var i = 0; i < 22; i++) {
    for (var s = -1; s <= 1; s += 2) {
      var mod = new THREE.Group();
      var pickWall = (i + (s > 0 ? 1 : 0)) % 3;
      var f = new THREE.Mesh(wallGeo, wallMats[pickWall]);
      f.position.set(0, 3.2, 0);
      f.receiveShadow = true;
      f.castShadow = true;
      mod.add(f);

      // tree clumps above the coping
      var nTrees = 1 + ((i + s) & 1);
      for (var t = 0; t < nTrees; t++) {
        var tz = -4 + t * 5 + Math.random() * 3;
        var r = 1.6 + Math.random() * 1.3;
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), trunkMat);
        trunk.position.set(Math.random() * 1.2 * (s > 0 ? 1 : -1), 6.8, tz);
        mod.add(trunk);
        var crown = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8),
          leafMats[(Math.random() * leafMats.length) | 0]);
        crown.scale.y = 0.85;
        crown.position.set(trunk.position.x, 7.6 + r * 0.7, tz);
        crown.castShadow = true;
        mod.add(crown);
      }

      // catenary mast on every other module, signal on some
      if (i % 2 === 0) {
        var mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, 7.2, 0.16), MAT.post);
        mast.position.set(s * -1.35, 3.6, 2.5);           // just inside the wall
        mast.castShadow = true;
        mod.add(mast);
        var arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), MAT.post);
        arm.position.set(s * -2.1, 6.85, 2.5);
        mod.add(arm);
        if (i % 8 === 0) {                                 // red signal box
          var sig = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.24), lam(0xd8352a));
          sig.position.set(s * -1.35, 3.4, 2.32);
          mod.add(sig);
          var lampG = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10),
            new THREE.MeshBasicMaterial({ color: 0x3fd45c }));
          lampG.position.set(s * -1.35, 3.62, 2.45);       // faces the camera
          mod.add(lampG);
          var lampR = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10),
            new THREE.MeshBasicMaterial({ color: 0x8a2018 }));
          lampR.position.set(s * -1.35, 3.24, 2.45);
          mod.add(lampR);
        }
      }

      mod.position.set(s * 7.0, 0, 16 - i * 12);
      scene.add(mod); fences.push(mod);
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

// subtle woven-cloth texture so big clothing surfaces don't read as plastic
var fabricTexture = (function () {
  var c = document.createElement("canvas"); c.width = c.height = 64;
  var g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64);
  for (var i = 0; i < 1200; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(20,20,60,0.06)" : "rgba(255,255,255,0.07)";
    g.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 2, 1);
  }
  for (i = 0; i < 64; i += 4) {                        // faint weave rows
    g.fillStyle = "rgba(0,0,50,0.03)";
    g.fillRect(0, i, 64, 1);
  }
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
// generated tintable cloth textures (GPT Image, near-white so material.color
// tints them); fall back to the procedural weave when a file is absent
var clothTex = {
  denim:  genTex("denim", 2, 2)  || fabricTexture,
  knit:   genTex("knit", 3, 3)   || fabricTexture,
  canvas: genTex("canvas", 2, 2) || fabricTexture,
};
function fabric(c, kind) {
  var map = (kind && clothTex[kind]) || fabricTexture;
  return new THREE.MeshLambertMaterial({ color: conv(c), map: map });
}

function buildRunner(opts) {
  var body = new THREE.Group();           // rotates for the somersault / lean
  var g = new THREE.Group();              // world placement
  g.add(body);
  body.rotation.x = LEAN;

  var shirt = fabric(opts.shirt, "denim"), pants = fabric(opts.pants, "denim"),
      shoes = lam(opts.shoes), capM = fabric(opts.cap, "canvas");
  var sleeves = opts.sleeves ? fabric(opts.sleeves, "knit") : shirt;
  var beefy = opts.beefy ? 1.18 : 1;

  /* --- one chunky torso volume the limbs tuck into --- */
  var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.31 * beefy, 0.3, 12, 32), shirt);
  torso.scale.set(1.06, 1, 0.9);
  torso.position.y = 1.18; body.add(torso);
  // hoodie hem peeking out under the vest
  var hem = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * beefy, 0.32 * beefy, 0.12, 32), sleeves);
  hem.position.y = 0.86; body.add(hem);
  var pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.27 * beefy, 32, 22), pants);
  pelvis.scale.set(1.05, 0.75, 0.85);
  pelvis.position.y = 0.78; body.add(pelvis);
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.24, 24), MAT.skin);
  neck.position.y = 1.72; body.add(neck);

  if (opts.sleeves) {
    // vest front: zipper, chest pockets, hood drawstrings
    var zipper = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.52, 0.03), lam(0xd8dde6));
    zipper.position.set(0, 1.22, -0.3 * beefy); body.add(zipper);
    for (var pS = -1; pS <= 1; pS += 2) {
      var pocket = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.03), lam(opts.shirt));
      pocket.position.set(pS * 0.17, 1.34, -0.295 * beefy);
      body.add(pocket);
      var pocketFlap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.035),
        new THREE.MeshLambertMaterial({ color: shade(opts.shirt, 0.7) }));
      pocketFlap.position.set(pS * 0.17, 1.4, -0.3 * beefy);
      body.add(pocketFlap);
      var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.17, 10), lam(0xf2ede4));
      cord.position.set(pS * 0.09, 1.5, -0.3 * beefy);
      cord.rotation.z = pS * 0.15;
      body.add(cord);
    }
  }

  // rounded shoulder yoke sealing torso, arms and hood together
  var chest = new THREE.Mesh(new THREE.SphereGeometry(0.31 * beefy, 32, 22), shirt);
  chest.scale.set(1.06, 0.6, 0.9);
  chest.position.y = 1.6; body.add(chest);
  // hood bunched over the shoulders and upper back
  var hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 22),
    opts.hood ? fabric(opts.hood, "knit") : shirt);
  hood.scale.set(1.2, 0.58, 1);
  hood.position.set(0, 1.68, 0.2 * beefy); body.add(hood);

  if (opts.bandana) {
    var scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.225, 0.17, 28), fabric(opts.bandana, "knit"));
    scarf.position.y = 1.82; body.add(scarf);
    var knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), lam(opts.bandana));
    knot.position.set(0.1, 1.74, 0.2); body.add(knot);
  }

  /* --- big head with an actual face (they run toward -z) --- */
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 30), MAT.skin);
  head.scale.set(1, 0.95, 0.98);
  head.position.y = 2.12; body.add(head);

  var eyeM = lam(0x2a2620);
  for (var eS = -1; eS <= 1; eS += 2) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 16), eyeM);
    eye.scale.set(0.8, 1.25, 0.55);
    eye.position.set(eS * 0.135, 2.14, -0.33); body.add(eye);
    var glint = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(eS * 0.105, 2.19, -0.375); body.add(glint);
    var brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05),
      lam(opts.brow || opts.hair || 0x5c4630));
    brow.position.set(eS * 0.14, 2.29, -0.315);
    brow.rotation.z = eS * (opts.angry ? 0.35 : -0.12);   // angry brows tilt inward
    body.add(brow);
  }
  var nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), lam(0xdfa06f));
  nose.position.set(0, 2.06, -0.365); body.add(nose);
  if (opts.mustache) {
    var mo = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.07), lam(0xd8d4cc));
    mo.position.set(0, 1.98, -0.33); body.add(mo);
  } else {
    var mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), lam(0x8a4a3a));
    mouth.scale.set(1.5, 0.7, 0.4);
    mouth.position.set(0, 1.96, -0.325); body.add(mouth);
  }
  for (var cS = -1; cS <= 1; cS += 2) {                   // ears
    var ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), MAT.skin);
    ear.scale.set(0.5, 0.8, 0.7);
    ear.position.set(cS * 0.355, 2.08, -0.02); body.add(ear);
  }

  if (opts.hair) {
    var hairM = lam(opts.hair);
    var fringe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.12), hairM);
    fringe.position.set(0, 2.32, -0.29); body.add(fringe);
    for (var hS = -1; hS <= 1; hS += 2) {
      var tuft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.26), hairM);
      tuft.position.set(hS * 0.32, 2.2, -0.05); body.add(tuft);
    }
  }

  /* --- cap sitting on the bigger head --- */
  var capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.375, 0.15, 32), capM);
  capTop.position.y = 2.38; body.add(capTop);
  var dome = new THREE.Mesh(new THREE.SphereGeometry(0.365, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  dome.position.y = 2.42; body.add(dome);
  var brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.34),
    opts.brimColor ? lam(opts.brimColor) : capM);
  brim.position.set(0, 2.34, opts.brimForward ? -0.5 : 0.5);   // backwards cap for the surfer
  body.add(brim);
  var button = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12),
    opts.brimColor ? lam(opts.brimColor) : capM);
  button.position.y = 2.6; body.add(button);
  if (opts.brimColor && opts.brimForward) {
    // colored rear panel so the forward-worn cap pops from behind too
    var panel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.05), lam(opts.brimColor));
    panel.position.set(0, 2.37, 0.35); body.add(panel);
  }

  if (opts.badge) {
    var badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.03), lam(0xe8c93f));
    badge.position.set(-0.17, 1.44, -0.33 * beefy); body.add(badge);
  }

  function armAt(sx) {
    var arm = new THREE.Group();
    arm.position.set(sx * 0.38 * beefy, 1.54, 0);   // tucked into the shoulder yoke
    var shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), sleeves);
    arm.add(shoulder);
    var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 12, 24), sleeves);
    upper.position.y = -0.17; arm.add(upper);
    var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), sleeves);
    elbow.position.y = -0.34; arm.add(elbow);
    var fore = new THREE.Group(); fore.position.y = -0.34;
    fore.rotation.x = -0.85;                                      // pumping elbows
    var lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.18, 12, 24), sleeves);
    lower.position.y = -0.13; fore.add(lower);
    var hand = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 16), MAT.skin);
    hand.scale.set(1, 0.9, 1.1);                                  // mitt hands
    hand.position.y = -0.29; fore.add(hand);
    arm.add(fore);
    arm.rotation.z = sx * -0.2;
    body.add(arm);
    return arm;
  }
  function legAt(sx) {
    var thigh = new THREE.Group();
    thigh.position.set(sx * 0.17, 0.84, 0);
    var hip = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 16), pants);
    thigh.add(hip);
    var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.24, 12, 24), pants);
    upper.position.y = -0.2; thigh.add(upper);
    var knee = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), pants);
    knee.position.y = -0.4; thigh.add(knee);
    var shin = new THREE.Group(); shin.position.y = -0.4;
    var lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.2, 12, 24), pants);
    lower.position.y = -0.15; shin.add(lower);
    // chunky sneaker: body + rounded toe + sole stripe + heel patch
    var shoe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.13, 0.36), shoes);
    shoe.position.set(0, -0.38, -0.06); shin.add(shoe);
    var toe = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), shoes);
    toe.scale.set(0.9, 0.72, 0.9);
    toe.position.set(0, -0.39, -0.24); shin.add(toe);
    if (opts.shoeAccent) {
      var wrap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.38), lam(opts.shoeAccent));
      wrap.position.set(0, -0.415, -0.06); shin.add(wrap);
      var heel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.06), lam(opts.shoeHeel || 0xd8352a));
      heel.position.set(0, -0.37, 0.11); shin.add(heel);
    }
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

/* Frame-rate-independent exponential smoothing toward a target. Higher
   lambda = snappier; used both to track the run cycle and to melt the
   snap when the pose switches between run / jump / roll states. */
function damp(cur, tgt, dt, lambda) {
  return tgt + (cur - tgt) * Math.exp(-lambda * dt);
}

/* Drives one runner's six joints (+ torso bob / twist) toward a target
   pose for the given mode, then damps the actual rotations toward it so
   every transition is a smooth blend instead of a hard snap.
   modes: "run" (phase/amp drive a gait), "air" (leap tuck), "tuck" (roll
   ball — caller owns the body somersault). */
function poseRunner(r, dt, mode, phase, amp) {
  var aL = 0, aR = 0, tL = 0, tR = 0, sL = 0, sR = 0;
  var bobY = null, twist = 0, rollZ = 0;

  if (mode === "air") {
    aL = 2.4; aR = 2.1;                         // arms flung up
    tL = 1.2; tR = -0.3;                        // lead knee tucked
    sL = -1.9; sR = -0.5;
    bobY = 0;
  } else if (mode === "tuck") {
    aL = aR = 2.5;                              // curl into a ball
    tL = tR = 1.95;
    sL = sR = -2.5;
  } else {                                      // run
    var s = Math.sin(phase), c = Math.cos(phase);
    aL = -s * amp * 0.95; aR = s * amp * 0.95;
    tL =  s * amp;        tR = -s * amp;
    // knee bend peaks during recovery; squared so it's smooth (C1) at the
    // zero-crossing instead of the kink a max(0,sin) produces
    var bL = Math.max(0, Math.sin(phase + 2.2));
    var bR = Math.max(0, Math.sin(phase + 2.2 + Math.PI));
    sL = -bL * bL * amp * 1.7;
    sR = -bR * bR * amp * 1.7;
    bobY  = Math.abs(c) * 0.055 * amp;          // vertical bob each stride
    twist = c * 0.07 * amp;                     // spine counter-twist to the arms
    rollZ = s * 0.035 * amp;                    // subtle shoulder roll
  }

  var L = 26;
  r.armL.rotation.x   = damp(r.armL.rotation.x,   aL, dt, L);
  r.armR.rotation.x   = damp(r.armR.rotation.x,   aR, dt, L);
  r.thighL.rotation.x = damp(r.thighL.rotation.x, tL, dt, L);
  r.thighR.rotation.x = damp(r.thighR.rotation.x, tR, dt, L);
  r.shinL.rotation.x  = damp(r.shinL.rotation.x,  sL, dt, L);
  r.shinR.rotation.x  = damp(r.shinR.rotation.x,  sR, dt, L);
  // twist/roll damp toward 0 outside run mode — safe during a roll, which
  // drives body.rotation.x (a different axis)
  r.body.rotation.y = damp(r.body.rotation.y, twist, dt, L);
  r.body.rotation.z = damp(r.body.rotation.z, rollZ, dt, L);
  if (bobY !== null) r.body.position.y = damp(r.body.position.y, bobY, dt, 30);
}

var player = buildRunner({
  shirt: 0x5f8ad0,                       // denim vest torso…
  sleeves: 0xf2ead8, hood: 0xd9cbaa,     // …over a cream hoodie
  pants: 0x7d99cf,                       // washed-denim jeans
  shoes: 0xf2ede0, shoeAccent: 0x49b82e, shoeHeel: 0xd8352a,
  cap: 0xf2ede4, brimColor: 0xd8352a, brimForward: true,
  hair: 0x6b4226, bandana: 0xd8352a,
});
scene.add(player.group);

/* ------------------------------------------------------------------ *
 *  Jake — the rigged Rodin GLB with a baked "Run" cycle, overlaid on the
 *  procedural runner. The primitive body stays in the scene for hitboxes
 *  and physics but is hidden; this skinned mesh mirrors its world
 *  placement and plays the Run clip through an AnimationMixer. Degrades
 *  gracefully: if the loader or the model file is missing, the procedural
 *  runner simply stays visible and nothing else changes.
 * ------------------------------------------------------------------ */
var jake = { root: null, mixer: null, action: null, ready: false, baseScale: 1.7 };
(function loadJake() {
  if (typeof THREE.GLTFLoader !== "function" || !window.FS_JAKE_GLB) return;
  new THREE.GLTFLoader().load(window.FS_JAKE_GLB, function (gltf) {
    var root = gltf.scene;
    root.scale.setScalar(jake.baseScale);
    root.rotation.y = Math.PI;                  // face -z, into the run
    root.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;                // skinned bounds are unreliable
      }
    });
    scene.add(root);
    jake.root = root;
    jake.mixer = new THREE.AnimationMixer(root);
    if (gltf.animations && gltf.animations.length) {
      jake.action = jake.mixer.clipAction(gltf.animations[0]);
      jake.action.play();
    }
    player.body.visible = false;                // retire the primitive puppet
    jake.ready = true;
  }, undefined, function (err) {
    console.warn("[FS] Jake model failed to load; keeping procedural runner", err);
  });
})();

// mirror the hidden runner's placement onto Jake and advance his Run cycle
function syncJake(dt) {
  if (!jake.ready) return;
  var root = jake.root;
  var tempo = state === "menu" ? 1.0 : Math.max(0.55, Math.min(2.4, speed / BASE_SPEED));
  jake.mixer.update(dt * tempo);
  root.position.copy(player.group.position);

  if (state === "dying" || state === "over") {
    root.rotation.x = Math.min(root.rotation.x + 4 * dt, 1.4);   // tip forward
    root.scale.setScalar(jake.baseScale);
  } else if (rollT > 0) {
    root.rotation.x = 0;
    root.scale.set(jake.baseScale, jake.baseScale * 0.55, jake.baseScale);
    root.position.y -= 0.35;                     // sink into the tuck
  } else {
    root.rotation.x = 0;
    root.scale.setScalar(jake.baseScale);
  }
  root.visible = invincibleT > 0 ? (Math.floor(performance.now() / 90) % 2 === 0) : true;
}

var board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 1.5), MAT.board);
board.visible = false;
board.castShadow = true;
scene.add(board);

// the inspector + dog, chasing behind
var guard = buildRunner({
  shirt: 0xb09a72, pants: 0x8a744e, shoes: 0x2c2418,
  cap: 0xb09a72, brimForward: true, beefy: true, badge: true, mustache: true,
  angry: true, brow: 0x8a8078,
});
scene.add(guard.group);

var dog = (function () {
  var g = new THREE.Group();
  var fur = lam(0xe8e0d0), dark = lam(0x8a8078);
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
  var liv = trainLiveries[(Math.random() * trainLiveries.length) | 0];
  var g = new THREE.Group();
  var bodyLen = opts.ramp ? len - RAMP_LEN : len;
  var zC = opts.ramp ? -RAMP_LEN / 2 : 0;
  var bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2, TRAIN_H, bodyLen), lam(liv.body));
  bodyMesh.position.set(0, TRAIN_H / 2, zC);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  g.add(bodyMesh);
  // flat walkable roof with rounded shoulder trims
  var roof = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 - 0.16, 0.14, bodyLen - 0.2), lam(liv.roof));
  roof.position.set(0, TRAIN_H + 0.07, zC);
  roof.receiveShadow = true;
  g.add(roof);
  var trimGeo = new THREE.CylinderGeometry(0.11, 0.11, bodyLen - 0.2, 8);
  for (var sT = -1; sT <= 1; sT += 2) {
    var trim = new THREE.Mesh(trimGeo, lam(liv.roof));
    trim.rotation.x = Math.PI / 2;
    trim.position.set(sT * (TRAIN_W - 0.1), TRAIN_H + 0.02, zC);
    g.add(trim);
  }
  // roof vents
  var nV = Math.max(1, Math.round(bodyLen / 6));
  for (var v = 0; v < nV; v++) {
    var vent = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.1), lam(0x9aa4ac));
    vent.position.set(0, TRAIN_H + 0.2,
      zC - bodyLen / 2 + (v + 0.5) * (bodyLen / nV));
    g.add(vent);
  }
  // dark under-skirt with wheel bogies
  var skirt = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.06, 0.5, bodyLen - 0.3),
    lam(0x23262b));
  skirt.position.set(0, 0.25, zC);
  g.add(skirt);
  // livery stripe
  var stripe = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.05, 0.26, bodyLen - 0.4),
    lam(liv.stripe));
  stripe.position.set(0, 1.02, zC);
  g.add(stripe);
  // window band with a cool sky reflection
  var win = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 + 0.04, 0.55, bodyLen - 1),
    new THREE.MeshLambertMaterial({ color: conv(0x24313e), emissive: conv(0x4a7a9e),
      emissiveIntensity: 0.28 }));
  win.position.set(0, TRAIN_H * 0.66, zC);
  g.add(win);
  // sliding doors
  var doorMat = new THREE.MeshLambertMaterial({ color: shade(liv.body, 0.62) });
  var nDoors = Math.max(1, Math.round(bodyLen / 7));
  for (var d = 0; d < nDoors; d++) {
    for (var sSign = -1; sSign <= 1; sSign += 2) {
      var door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 1.1), doorMat);
      door.position.set(sSign * (TRAIN_W + 0.02), 1.15,
        zC - bodyLen / 2 + (d + 0.5) * (bodyLen / nDoors));
      g.add(door);
    }
  }
  if (opts.ramp) {
    // sloped tail the runner can sprint up
    var ramp = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2, 0.25, Math.hypot(RAMP_LEN, TRAIN_H) + 0.4), rampMat);
    ramp.position.set(0, TRAIN_H / 2, len / 2 - RAMP_LEN / 2);
    ramp.rotation.x = Math.atan2(TRAIN_H, RAMP_LEN);
    ramp.castShadow = ramp.receiveShadow = true;
    g.add(ramp);
  } else {
    // cab face toward the player: windshield, yellow nose panel, headlights
    var frontZ = zC + bodyLen / 2;
    var face = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 - 0.08, TRAIN_H - 0.3, 0.1),
      lam(liv.stripe));
    face.position.set(0, TRAIN_H / 2 + 0.05, frontZ + 0.03);
    g.add(face);
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 - 0.5, 0.75, 0.08),
      new THREE.MeshLambertMaterial({ color: conv(0x1d2a38), emissive: conv(0x4a7a9e),
        emissiveIntensity: 0.3 }));
    windshield.position.set(0, TRAIN_H - 0.62, frontZ + 0.1);
    g.add(windshield);
    var nose = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W * 2 - 0.3, 0.5, 0.12),
      lam(0xe8b52e));
    nose.position.set(0, 0.62, frontZ + 0.06);
    g.add(nose);
    for (var hS = -1; hS <= 1; hS += 2) {
      var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.08),
        new THREE.MeshBasicMaterial({ color: opts.moving ? 0xfff8c8 : 0xd8dde6 }));
      lamp.position.set(hS * (TRAIN_W - 0.4), 1.12, frontZ + 0.12);
      g.add(lamp);
    }
  }
  g.position.set(LANE_X[lane], 0, z);
  scene.add(g);
  obstacles.push({ kind: "train", mesh: g, lane: lane, halfLen: len / 2,
                   ramp: !!opts.ramp, moving: opts.moving || 0 });
}

function makeHurdle(lane, z) {
  var g = new THREE.Group();
  // red/white striped barrier bar
  var segW = (LANE_HALF * 2) / 5;
  for (var i = 0; i < 5; i++) {
    var seg = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.3, 0.18),
      i % 2 ? MAT.hurdleWhite : MAT.hurdleS);
    seg.position.set(-LANE_HALF + segW * (i + 0.5), HURDLE_H - 0.15, 0);
    g.add(seg);
  }
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

var coinFaceMat = (function () {
  var t = genTex("coin");
  return t ? new THREE.MeshBasicMaterial({ map: t, transparent: true,
               alphaTest: 0.35, side: THREE.DoubleSide }) : null;
})();
var coinFaceGeo = new THREE.PlaneGeometry(0.95, 0.95);

function makeCoin(lane, z, y) {
  var g = new THREE.Group();
  if (coinFaceMat) {
    g.add(new THREE.Mesh(coinFaceGeo, coinFaceMat));
  } else {
    var c = new THREE.Mesh(coinGeo, MAT.coin);
    c.rotation.x = Math.PI / 2;
    g.add(c);
  }
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
  player.body.position.set(0, 0, 0);
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
$("btn-pause").addEventListener("click", togglePause);
window.addEventListener("blur", function () { if (state === "running") togglePause(); });

/* ------------------------------------------------------------------ *
 *  Per-frame update
 * ------------------------------------------------------------------ */
function playerHeight() { return rollT > 0 ? ROLL_H : STAND_H; }

function updateWorld(dt) {
  var dz = speed * dt;
  traveled += dz;

  // the ballast slab is a static strip — scroll its texture with the world
  if (MAT.ballast.map) {
    var bm = MAT.ballast.map;
    bm.offset.y += dz * (bm.repeat.y / 320);
    bm.offset.y -= Math.floor(bm.offset.y);
  }

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
  poseRunner(guard, dt, "run", runPhase * 0.9, 0.85);
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
    // tumble over — pivoted above the feet so nothing sweeps underground
    player.body.rotation.x -= 9 * dt;
    var thd = LEAN - player.body.rotation.x;
    player.body.position.y = 0.68 * (1 - Math.cos(thd));
    player.body.position.z = 0.68 * Math.sin(thd);
    player.group.position.z += 3.5 * dt;
  } else if (rollT > 0) {
    // somersault about the tucked ball's centre (not the feet), so no
    // limb ever sweeps below the ground plane
    var th = (1 - rollT / ROLL_TIME) * Math.PI * 2;
    var pivot = 0.68;
    player.body.rotation.x = LEAN - th;
    player.body.scale.y = 0.5;
    player.body.position.y = pivot * (1 - Math.cos(th));
    player.body.position.z = pivot * Math.sin(th);
    poseRunner(player, dt, "tuck");          // curl the limbs into the ball
  } else {
    player.body.rotation.x = LEAN;
    player.body.scale.y = 1;
    player.body.position.z = 0;
    if (!grounded && pu.jetpack <= 0) {
      poseRunner(player, dt, "air");
    } else {
      runPhase += speed * dt * 0.85;
      poseRunner(player, dt, "run", runPhase, 1.05);
    }
  }
  // the dog's happy tail
  dog.userData.tail.rotation.y = Math.sin(performance.now() / 90) * 0.5;
  // blink while invincible
  player.group.visible = invincibleT > 0 ? (Math.floor(performance.now() / 90) % 2 === 0) : true;

  // drive Jake (the skinned model overlaying the hidden primitive runner)
  syncJake(dt);

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
  // frozen for a deterministic headless screenshot: re-render, don't advance
  if (window.__FS_freeze) { renderer.render(scene, camera); return; }
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
    // idle jog-in-place behind the menu (updateVisuals poses the runner)
    runPhase += dt * 6;
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

// #autostart (or #shot=<sec>) skips the menu — used by automated
// screenshots / testing. Exposes a step function so a throttled/hidden tab
// (or a headless one-shot renderer) can be driven deterministically.
if (location.hash.indexOf("autostart") >= 0 || location.hash.indexOf("shot=") >= 0) {
  startGame();
  window.__FS_step = function (sec) {
    var n = Math.max(1, Math.round(sec * 60));
    for (var i = 0; i < n; i++) {
      if (state === "running") {
        speed = Math.min(MAX_SPEED, BASE_SPEED + traveled * 0.011);
        updateWorld(1 / 60); updatePlayer(1 / 60); updateGuard(1 / 60);
        score += speed * (1 / 60) * mult;
      } else if (state === "dying") {
        dyingT += 1 / 60;
        updateWorld(0.15 / 60);
        if (caught) guardZ += (0.8 - guardZ) * Math.min(1, 6 / 60);
        guard.group.position.set(px * 0.85, 0, guardZ);
        if (dyingT > 0.9) { showGameOver(); break; }
      } else break;
      updateVisuals(1 / 60);
    }
    updateHud();
    renderer.render(scene, camera);
    return state;
  };
  // #shot=<sec>[&act=roll|jump|tumble]: advance to a fixed sim time
  // (optionally triggering an action), then freeze the render so a single
  // headless screenshot captures an exact, deterministic pose
  var shotM = location.hash.match(/shot=([\d.]+)/);
  if (shotM) {
    window.__FS_step(parseFloat(shotM[1]) || 1);
    var act = (location.hash.match(/act=(\w+)/) || [])[1];
    if (act === "roll")   { doRoll();  window.__FS_step(0.28); }
    if (act === "jump")   { doJump();  window.__FS_step(0.34); }
    if (act === "tumble") { endGame(false); window.__FS_step(0.45); }
    window.__FS_freeze = true;
  }
}

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
