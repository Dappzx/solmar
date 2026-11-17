// shots.js — screenshot staging for SOLMAR (make.fun gta6-01).
// applyShot(game, n) is called by main.js when the URL has ?shot=N.
// It only repositions entities and sets mission/wanted state — it never
// touches other files. All scenes are daytime. Shot 1 is the cover scene.
import { startMission, ensureCashPickups } from './missions.js';
import { addWanted } from './police.js';
import { createCar } from './cars.js';

const G = (i) => 176 + 352 * i; // road centreline coordinate (world 3200x3200)

// Real car shape from cars.js: createCar(type, x, y, angle, driver).
// model is a CAR_TYPES object, type is the string key ('sedan'|'taxi'|'coupe'|'cop'...).
function mkCar(x, y, angle, model, color, driver, speed = 0) {
  const car = createCar(model, x, y, angle, driver);
  if (color) car.color = color;
  car.speed = speed;
  return car;
}

function placePlayer(game, x, y, angle, car) {
  const p = game.player;
  p.x = x; p.y = y; p.angle = angle;
  p.health = 100;
  if (car) {
    p.onFoot = false;
    p.car = car;
    p.speed = car.speed || 0;
  } else {
    p.onFoot = true;
    p.car = null;
    p.speed = 0;
  }
  game.camera = { x, y, zoom: 1 };
}

function resetScene(game) {
  game.cars = [];
  game.traffic = [];
  game.cops = [];
  game.bullets = [];
  game.particles = [];
  game.peds = [];
  game.wanted = 0;
  game.heat = 0;
  game.mode = 'play';
  game.toast = null;
  game.taxiFare = null;
  game.taxiOffer = null;
  game.missionPrompt = null;
  if (game.missions) game.missions.active = null; // so startMission() below can stage the shot's mission
  ensureCashPickups(game);
}

function setWanted(game, n) {
  game.wanted = 0;
  game.heat = 0;
  try { addWanted(game, n); } catch (e) { game.wanted = n; game.heat = n; }
  game.wanted = n;
}

function addTraffic(game, spots) {
  for (const [x, y, angle, model, color] of spots) {
    const car = mkCar(x, y, angle, model, color, 'traffic', 120);
    // traffic.js shape: route + targetSpeed so updateTraffic can drive it.
    const axis = (angle === 0 || angle === Math.PI) ? 'x' : 'y';
    car.route = { axis, dir: (angle === 0 || angle === Math.PI / 2) ? 1 : -1 };
    car.targetSpeed = 120;
    car._lastCross = -1;
    game.traffic.push(car);
  }
}

function addCops(game, spots) {
  for (const [x, y, angle] of spots) {
    const car = mkCar(x, y, angle, 'cop', null, 'cop', 200);
    game.cars.push(car);
    // police.js shape: wrapper with .car (updatePolice/drawPolice expect this).
    game.cops.push({
      x, y, angle, speed: 200, state: 'chase',
      car, hp: 100, fireTimer: 0, searchTimer: 0,
    });
  }
}

const PED_COLORS = ['#8e44ad', '#16a085', '#d35400', '#2c3e50', '#2980b9', '#f39c12'];
const PED_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'];

function addPeds(game, spots) {
  for (const [x, y] of spots) {
    // traffic.js ped shape (updateTraffic/drawPeds need target + state).
    game.peds.push({
      x, y, angle: Math.random() * Math.PI * 2, speed: 40 + Math.random() * 30,
      state: 'walk',
      color: PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)],
      skin: PED_SKINS[Math.floor(Math.random() * PED_SKINS.length)],
      target: { x: x + 100, y: y + 60 },
      fleeUntil: 0, downTimer: 0,
    });
  }
}

export function applyShot(game, n) {
  resetScene(game);
  if (n === 1) {
    // Downtown police chase: wanted 3, three cop cars behind, "The Drop" active.
    const car = mkCar(G(4), G(4), 0, 'sedan', '#2f6fb2', 'player', 320);
    game.cars.push(car);
    placePlayer(game, G(4), G(4), 0, car);
    game.player.weapon = 'pistol';
    game.player.ammo = 24;
    addCops(game, [
      [G(4) - 170, G(4) - 30, 0],
      [G(4) - 300, G(4) + 35, 0],
      [G(4) - 430, G(4) - 25, 0],
    ]);
    addTraffic(game, [
      [G(5), G(4) + 180, Math.PI, 'sedan', '#c0c8d0'],
      [G(3), G(5), -Math.PI / 2, 'taxi', '#f2c200'],
      [G(6), G(3), Math.PI / 2, 'coupe', '#c0392b'],
    ]);
    addPeds(game, [[G(4) + 90, G(4) + 90], [G(5) - 60, G(4) - 90]]);
    startMission(game, 3); // The Drop
    if (game.missions.active) game.missions.active.objectiveIndex = 1; // delivery leg
    setWanted(game, 3);
  } else if (n === 2) {
    // On foot in front of Hotel Meridian, "First Fare", peds + taxi.
    placePlayer(game, G(7) - 40, G(1) + 95, -Math.PI / 2, null);
    game.player.weapon = 'fists';
    addTraffic(game, [[G(7) - 260, G(1), 0, 'taxi', '#f2c200']]);
    addPeds(game, [
      [G(7) - 120, G(1) + 80], [G(7) + 40, G(1) + 110],
      [G(7) - 200, G(1) + 70], [G(7) + 120, G(1) + 60],
    ]);
    addTraffic(game, [[G(6), G(1), 0, 'sedan', '#7d8a99']]);
    startMission(game, 0); // First Fare
    // Stage the delivery leg: the marker then points at Hotel Meridian
    // (G(7), G(1)), right in frame, instead of the far pickup point.
    if (game.missions.active) game.missions.active.objectiveIndex = 1;
    setWanted(game, 0);
  } else if (n === 3) {
    // Speeding on the south coastal road in a red coupe, traffic, sea to the south.
    const car = mkCar(G(3), G(8), 0, 'coupe', 'red', 'player', 520);
    game.cars.push(car);
    placePlayer(game, G(3), G(8), 0, car);
    game.player.weapon = 'pistol';
    game.player.ammo = 12;
    addTraffic(game, [
      [G(3) + 420, G(8), 0, 'sedan', '#d8dee6'],
      [G(3) - 380, G(8), 0, 'taxi', '#f2c200'],
      [G(5), G(8), Math.PI, 'sedan', '#5b7a99'],
      [G(1), G(8), Math.PI, 'coupe', '#8e44ad'],
    ]);
    addPeds(game, [[G(4) + 60, G(8) + 95]]);
    // Stage "Hot Wheels" at its first objective: the guide line in
    // missions.js draws from the player to the active objective, so with no
    // active mission it fell back to the far next-mission start and the
    // dashed yellow line cut across the whole screen. The Hot Wheels target
    // is the dock at (G(2), 2900) — ~360px away, inside this shot's frame —
    // so the line stays short and in-frame. No other file needed changing.
    // (startMission also parks the Hot Wheels red coupe at the dock, which
    // reads as set dressing in this shot.)
    startMission(game, 1); // Hot Wheels
    if (game.missions.active) game.missions.active.objectiveIndex = 0; // dock leg
    setWanted(game, 0);
  } else if (n === 4) {
    // Yacht dock, "King of Solmar", 2 stars, getaway to the yacht.
    const car = mkCar(G(5) - 320, 2900, 0, 'coupe', 'red', 'player', 240);
    game.cars.push(car);
    placePlayer(game, G(5) - 320, 2900, 0, car);
    game.player.weapon = 'pistol';
    game.player.ammo = 30;
    addCops(game, [
      [G(5) - 560, 2900 - 20, 0],
      [G(5) - 700, 2900 + 30, 0],
    ]);
    addTraffic(game, [[G(3), 2900, Math.PI, 'sedan', '#c0c8d0']]);
    addPeds(game, [[G(5) + 60, 2900 + 60], [G(5) - 120, 2900 - 70]]);
    startMission(game, 4); // King of Solmar
    if (game.missions.active) game.missions.active.objectiveIndex = 1; // yacht leg
    setWanted(game, 2);
  }
  // Keep the camera centred on the player for every shot, clamped inside
  // the world: without the clamp the view runs past the map edge and the
  // screenshot gets a black strip (shot mode never runs the update loop,
  // so main.js's camera clamp never gets a chance to run).
  game.camera = {
    x: Math.max(640, Math.min(2560, game.player.x)),
    y: Math.max(360, Math.min(2840, game.player.y)),
    zoom: 1,
  };
}
