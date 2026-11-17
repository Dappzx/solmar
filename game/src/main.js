// SOLMAR — boot, mode machine and the fixed-step game loop.
// Modes: menu → play ⇄ paused → busted / wasted / complete, plus the
// transient 'mission-complete' splash (missions.js flips it back to 'play').
// NOTE: the live sibling modules use 'play', not 'playing', as the running
// mode — this file matches them, or a finished mission would soft-lock.
// Sibling systems (player, cars, traffic, police, combat, missions, hud,
// audio, save, shots) are built by other builders; this file trusts the
// contracts named in the imports below and guards the calls it can, so one
// system's failure degrades the game instead of killing the loop.
import { createCity } from './city.js';
import { createInput } from './input.js';
import { drawWorld } from './render.js';
import { createPlayer, updatePlayer, drawPlayer } from './player.js';
import { createCar, updateCars, drawCars, enterCar, exitCar } from './cars.js';
import { spawnTraffic, updateTraffic, drawTraffic, spawnPeds, drawPeds } from './traffic.js';
import { updateWanted, updatePolice, drawPolice, addWanted } from './police.js';
import { updateBullets, drawBullets, updateParticles, drawParticles, shoot } from './combat.js';
import { MISSION_LIST, startMission, updateMissions, drawMissionMarkers } from './missions.js';
import { drawHUD, drawMinimap } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { applyShot } from './shots.js';
import { STEP, WORLD_SIZE } from './config.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

// One log line per distinct failure, so a broken system degrades quietly
// instead of spamming the console 60 times a second.
function safeCall(game, label, fn) {
  try {
    fn();
  } catch (err) {
    if (!game.reportedErrors) game.reportedErrors = new Set();
    const key = `${label}:${err && err.message}`;
    if (!game.reportedErrors.has(key)) {
      game.reportedErrors.add(key);
      console.error(`[solmar] ${label} failed:`, err);
    }
  }
}

// Build a player from the player module, falling back to the contract shape
// when the module is missing or returns something unexpected.
function makePlayer(city) {
  let made = null;
  try {
    made = createPlayer(city);
  } catch {
    made = null;
  }
  const base = {
    x: city.spawn.x,
    y: city.spawn.y,
    angle: -Math.PI / 2,
    speed: 0,
    onFoot: true,
    car: null,
    health: 100,
    weapon: 'fists',
    ammo: 0,
  };
  if (!made || typeof made !== 'object' || typeof made.x !== 'number' || typeof made.y !== 'number') return base;
  return { ...base, ...made };
}

function makeCar(x, y, angle, type) {
  let made = null;
  try {
    made = createCar(type, x, y, angle);
  } catch {
    made = null;
  }
  const base = {
    x,
    y,
    angle,
    speed: 0,
    steer: 0,
    type,
    color: '#c94f3d',
    driver: null,
    health: 100,
    model: { w: 46, h: 22, accel: 320, maxSpeed: 430, handling: 2.6 },
  };
  if (!made || typeof made !== 'object' || typeof made.x !== 'number' || typeof made.y !== 'number') return base;
  const car = { ...base, ...made };
  car.model = { ...base.model, ...(made.model || {}) };
  return car;
}

function freshState(city, player) {
  return {
    mode: 'menu',
    time: 0,
    money: 250,
    respect: 0,
    wanted: 0,
    heat: 0,
    city,
    player,
    cars: [],
    traffic: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    pickups: [],
    missions: { index: 0, active: null, done: [], startedIndex: -1 },
    camera: { x: player.x, y: player.y, zoom: 1 },
    busted: false,
    completedShown: false,
    saveMessage: '',
    saveMessageT: 0,
    menuButtons: [],
    reportedErrors: new Set(),
  };
}

function seedParkedCars(game) {
  const s = game.city.spawn;
  game.cars.push(
    makeCar(s.x + 30, s.y - 90, Math.PI / 2, 'sedan'),
    makeCar(s.x - 34, s.y + 130, -Math.PI / 2, 'coupe'),
    makeCar(s.x + 34, s.y + 260, Math.PI / 2, 'taxi'),
  );
}

function seedPopulation(game) {
  // spawnTraffic seeds 12 traffic cars AND 24 peds; it also updates the
  // peds every frame (there is no separate updatePeds in traffic.js).
  safeCall(game, 'spawnTraffic', () => spawnTraffic(game));
}

function createGame() {
  const city = createCity(seed);
  const player = makePlayer(city);
  const game = {
    ...freshState(city, player),
    input: createInput(canvas),
    audio: createAudio(),
    save: null,
  };
  seedParkedCars(game);
  seedPopulation(game);
  return game;
}

function unlockAudio(game) {
  if (game.audio && typeof game.audio.resume === 'function') {
    safeCall(game, 'audio.resume', () => game.audio.resume());
  }
}

// Start mission `missions.index` once. Guarded by startedIndex so a missions
// module that does not set `active` cannot be re-triggered every frame.
function beginMission(game) {
  if (!MISSION_LIST || MISSION_LIST.length === 0) return;
  if (game.missions.index >= MISSION_LIST.length) return;
  if (game.missions.active) return;
  if (game.missions.startedIndex === game.missions.index) return;
  safeCall(game, 'startMission', () => startMission(game, game.missions.index));
  game.missions.startedIndex = game.missions.index;
}

function startNewGame(game, opts = {}) {
  const city = game.city;
  const player = makePlayer(city);
  const keep = { input: game.input, audio: game.audio, save: game.save };
  Object.assign(game, freshState(city, player), keep);
  seedParkedCars(game);
  seedPopulation(game);
  game.mode = 'play';
  game.busted = false;
  unlockAudio(game);
  if (opts.autostartMission !== false) beginMission(game);
  announce('Playing. Follow the marker to your mission.');
}

function applySave(game, data) {
  if (!data || typeof data !== 'object') return false;
  const p = data.player || {};
  if (typeof p.x === 'number') game.player.x = p.x;
  if (typeof p.y === 'number') game.player.y = p.y;
  if (typeof p.health === 'number') game.player.health = p.health;
  if (typeof p.weapon === 'string') game.player.weapon = p.weapon;
  if (typeof p.ammo === 'number') game.player.ammo = p.ammo;
  if (typeof data.money === 'number') game.money = data.money;
  if (typeof data.respect === 'number') game.respect = data.respect;
  if (typeof data.wanted === 'number') game.wanted = data.wanted;
  if (data.missions && typeof data.missions === 'object') {
    if (Array.isArray(data.missions.done)) game.missions.done = data.missions.done;
    if (typeof data.missions.index === 'number') game.missions.index = data.missions.index;
  }
  game.missions.active = null;
  game.missions.startedIndex = -1;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  return true;
}

function continueGame(game) {
  let data = null;
  try {
    data = loadGame();
  } catch {
    data = null;
  }
  if (!data) {
    game.saveMessage = 'No save found.';
    game.saveMessageT = 2;
    return;
  }
  startNewGame(game, { autostartMission: false });
  applySave(game, data);
  beginMission(game);
  announce('Save loaded. Welcome back to Solmar.');
}

function doSave(game) {
  try {
    saveGame(game);
    game.saveMessage = 'Progress saved.';
  } catch {
    game.saveMessage = 'Save failed.';
  }
  game.saveMessageT = 2.5;
}

function safeHasSave() {
  try {
    return !!hasSave();
  } catch {
    return false;
  }
}

function setMode(game, mode) {
  if (game.mode === mode) return;
  game.mode = mode;
  if (mode === 'busted') announce('Busted! The Solmar police caught Jax. Press Enter to try again.');
  if (mode === 'wasted') announce('Wasted! Jax is down. Press Enter to try again.');
  if (mode === 'complete') announce('All missions complete! Solmar is yours. Press Enter to keep roaming.');
  if (mode === 'paused') announce('Paused.');
}

function buttonAt(buttons, x, y) {
  for (const b of buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}

function handleModeInput(game) {
  const input = game.input;
  const pressed = input.pressed;
  // Transition keys are CONSUMED here: if the frame's fixed-step update does
  // not run (accumulator a hair under STEP), a leftover Escape would
  // re-trigger the transition on the next frame (resume → instant re-pause).
  if (game.mode === 'menu') {
    if (pressed.has('Enter')) {
      pressed.delete('Enter');
      startNewGame(game);
      return;
    }
    if (pressed.has('KeyC') && safeHasSave()) {
      pressed.delete('KeyC');
      continueGame(game);
      return;
    }
    if (pressed.has('MouseLeft')) {
      const b = buttonAt(game.menuButtons, input.mouse.x, input.mouse.y);
      pressed.delete('MouseLeft');
      if (b === 'start') startNewGame(game);
      else if (b === 'continue') continueGame(game);
    }
    return;
  }
  if (game.mode === 'play') {
    if (pressed.has('Escape')) {
      pressed.delete('Escape');
      setMode(game, 'paused');
    }
    return;
  }
  if (game.mode === 'paused') {
    if (pressed.has('Escape') || pressed.has('Enter')) {
      pressed.delete('Escape');
      pressed.delete('Enter');
      setMode(game, 'play');
      return;
    }
    if (pressed.has('MouseLeft')) {
      const b = buttonAt(game.menuButtons, input.mouse.x, input.mouse.y);
      pressed.delete('MouseLeft');
      if (b === 'resume') setMode(game, 'play');
      else if (b === 'save') doSave(game);
      else if (b === 'quit') setMode(game, 'menu');
    }
    return;
  }
  // busted / wasted / complete
  if (pressed.has('Enter') || pressed.has('MouseLeft')) {
    pressed.delete('Enter');
    pressed.delete('MouseLeft');
    if (game.mode === 'complete') setMode(game, 'play');
    else startNewGame(game);
  }
}

function update(game, dt) {
  game.time += dt;
  const input = game.input;
  const cam = game.camera;

  // Mouse position in world space (aiming).
  input.mouse.wx = cam.x + (input.mouse.x - canvas.width / 2) / cam.zoom;
  input.mouse.wy = cam.y + (input.mouse.y - canvas.height / 2) / cam.zoom;

  // NOTE: E (enter / exit car) is owned by updatePlayer — it reads
  // input.pressed itself. main.js must NOT handle E or the player would
  // enter and leave in the same frame. Missions also read E (mission-start
  // prompt); the press stays in `pressed` until the end of this update so
  // updateMissions can still see it.

  // Click to shoot while on foot and armed. (Wanted is raised by the combat
  // / police modules; main.js deliberately does not call addWanted here, so
  // a shot cannot be counted twice.)
  if (input.pressed.has('MouseLeft') && game.player.onFoot && game.player.weapon !== 'fists') {
    safeCall(game, 'shoot', () => shoot(game));
  }

  // Fixed update order: input -> player -> cars -> traffic -> peds ->
  // police -> combat -> missions -> particles -> camera -> audio -> hud.
  safeCall(game, 'updatePlayer', () => updatePlayer(game, dt));
  safeCall(game, 'updateCars', () => updateCars(game, dt));
  safeCall(game, 'updateTraffic', () => updateTraffic(game, dt));
  safeCall(game, 'updateWanted', () => updateWanted(game, dt));
  safeCall(game, 'updatePolice', () => updatePolice(game, dt));
  safeCall(game, 'updateBullets', () => updateBullets(game, dt));
  safeCall(game, 'updateMissions', () => updateMissions(game, dt));
  safeCall(game, 'updateParticles', () => updateParticles(game, dt));

  // NOTE: no updatePeds — updateTraffic moves the peds too. And no
  // auto-advance to the next mission here: missions.js owns that flow
  // (walk to the next start, press E on its prompt).

  // Camera: follow the player, ease toward them, clamp inside the city.
  const targetZoom = game.player.onFoot ? 1 : 0.85;
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 3);
  const k = Math.min(1, dt * 6);
  cam.x += (game.player.x - cam.x) * k;
  cam.y += (game.player.y - cam.y) * k;
  const halfW = canvas.width / 2 / cam.zoom;
  const halfH = canvas.height / 2 / cam.zoom;
  cam.x = clamp(cam.x, halfW, WORLD_SIZE - halfW);
  cam.y = clamp(cam.y, halfH, WORLD_SIZE - halfH);

  // Engine hum follows driving speed (audio has no per-frame update()).
  if (game.audio && typeof game.audio.engine === 'function') {
    const car = game.player.car;
    const max = (car && car.model && car.model.maxSpeed) || 430;
    const s01 = car ? clamp(Math.abs(car.speed) / max, 0, 1) : 0;
    safeCall(game, 'audio.engine', () => game.audio.engine(s01));
  }

  if (game.saveMessageT > 0) game.saveMessageT -= dt;

  // End states. Only while actually playing: police/combat set 'busted'
  // themselves mid-update (cop kill / capture), and the mission-complete
  // splash ('mission-complete') must not be overridden here — updateMissions
  // flips it back to 'play' after 2.5 s, and only then can 'complete' fire.
  if (game.mode === 'play') {
    if (game.player.health <= 0) setMode(game, 'wasted');
    else if (!game.completedShown && MISSION_LIST.length > 0 && game.missions.done.length >= MISSION_LIST.length) {
      game.completedShown = true;
      setMode(game, 'complete');
    }
  }

  input.clearPressed();
}

// --- Screens (drawn on top of the world) ---------------------------------

function drawButton(ctx2d, x, y, w, h, label, color, id) {
  ctx2d.fillStyle = color;
  ctx2d.fillRect(x, y, w, h);
  ctx2d.fillStyle = 'rgba(0,0,0,0.25)';
  ctx2d.fillRect(x, y + h - 6, w, 6);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 19px sans-serif';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(label, x + w / 2, y + h / 2 + 1);
  return { id, x, y, w, h };
}

function drawMenu(ctx2d, game) {
  ctx2d.fillStyle = 'rgba(5, 8, 16, 0.72)';
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#ffb347';
  ctx2d.font = 'bold 84px sans-serif';
  ctx2d.fillText('SOLMAR', cx, 170);
  ctx2d.fillStyle = '#e8d9b0';
  ctx2d.font = '22px sans-serif';
  ctx2d.fillText('Open World  •  Kota fiktif Solmar  •  Main sebagai Jax Moreno', cx, 212);
  ctx2d.fillStyle = '#cfd6e4';
  ctx2d.font = '17px sans-serif';
  const lines = [
    'WASD — jalan / mengemudi      Shift — lari      E — masuk / keluar mobil',
    'Space — handbrake      Mouse — bidik, klik — tembak      Esc — pause',
    'Selesaikan misi, kumpulkan uang, dan jangan sampai ditangkap polisi.',
  ];
  lines.forEach((line, i) => ctx2d.fillText(line, cx, 268 + i * 28));
  game.menuButtons = [drawButton(ctx2d, cx - 130, 380, 260, 54, '▶  START GAME', '#e0785a', 'start')];
  let y = 448;
  if (safeHasSave()) {
    game.menuButtons.push(drawButton(ctx2d, cx - 130, y, 260, 54, '↻  CONTINUE', '#3d8fb8', 'continue'));
    y += 68;
  }
  ctx2d.fillStyle = '#8a93a6';
  ctx2d.font = '14px sans-serif';
  ctx2d.fillText('Enter — start   •   C — continue (jika ada save)', cx, y + 18);
  ctx2d.fillText('v1.0 — semua konten orisinal, dibuat prosedural tanpa aset luar', cx, canvas.height - 24);
}

function drawPaused(ctx2d, game) {
  ctx2d.fillStyle = 'rgba(5, 8, 16, 0.66)';
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 52px sans-serif';
  ctx2d.fillText('PAUSED', cx, 220);
  ctx2d.font = '18px sans-serif';
  ctx2d.fillStyle = '#cfd6e4';
  ctx2d.fillText(
    `Uang $${game.money}   •   Respect ${game.respect}   •   Misi ${game.missions.done.length}/${MISSION_LIST.length}`,
    cx,
    262,
  );
  game.menuButtons = [
    drawButton(ctx2d, cx - 130, 310, 260, 50, '▶  RESUME', '#3f9e57', 'resume'),
    drawButton(ctx2d, cx - 130, 372, 260, 50, '💾  SAVE GAME', '#3d8fb8', 'save'),
    drawButton(ctx2d, cx - 130, 434, 260, 50, '🏠  MENU', '#5a6272', 'quit'),
  ];
  ctx2d.fillStyle = '#8a93a6';
  ctx2d.font = '14px sans-serif';
  ctx2d.fillText('Esc / Enter — lanjut', cx, 520);
}

function drawEnd(ctx2d, game) {
  const titles = {
    busted: ['BUSTED!', 'Polisi Solmar menangkap Jax.'],
    wasted: ['WASTED!', 'Jax tumbang di jalanan Solmar.'],
    complete: ['SOLMAR MILIKMU!', 'Semua misi selesai. Kota ini milik Jax Moreno.'],
  };
  const [title, sub] = titles[game.mode] || titles.wasted;
  ctx2d.fillStyle = 'rgba(5, 8, 16, 0.72)';
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = game.mode === 'complete' ? '#ffb347' : '#ff5a4e';
  ctx2d.font = 'bold 64px sans-serif';
  ctx2d.fillText(title, cx, 260);
  ctx2d.fillStyle = '#e8e8e8';
  ctx2d.font = '22px sans-serif';
  ctx2d.fillText(sub, cx, 308);
  ctx2d.fillStyle = '#cfd6e4';
  ctx2d.font = '18px sans-serif';
  ctx2d.fillText(
    `Uang $${game.money}   •   Respect ${game.respect}   •   Misi selesai ${game.missions.done.length}/${MISSION_LIST.length}`,
    cx,
    352,
  );
  ctx2d.fillStyle = '#8a93a6';
  ctx2d.font = '16px sans-serif';
  ctx2d.fillText(game.mode === 'complete' ? 'Enter — lanjut free roam' : 'Enter / klik — coba lagi', cx, 420);
}

function render(game) {
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawWorld(ctx, game);
  if (game.mode !== 'menu') {
    safeCall(game, 'drawHUD', () => drawHUD(ctx, game));
    safeCall(game, 'drawMinimap', () => drawMinimap(ctx, game));
  }
  if (game.mode === 'menu') drawMenu(ctx, game);
  else if (game.mode === 'paused') drawPaused(ctx, game);
  else if (game.mode === 'busted' || game.mode === 'wasted' || game.mode === 'complete') drawEnd(ctx, game);
  if (game.saveMessageT > 0 && game.saveMessage) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width / 2 - 110, 24, 220, 34);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.saveMessage, canvas.width / 2, 42);
  }
}

// --- Boot ------------------------------------------------------------------

const game = createGame();
window.__game = game;

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleModeInput(game);
  // 'play' and the 'mission-complete' splash both run the simulation;
  // the splash is flipped back to 'play' by updateMissions after 2.5 s.
  if (game.mode === 'play' || game.mode === 'mission-complete') {
    accumulator += elapsed;
    while (accumulator >= STEP && (game.mode === 'play' || game.mode === 'mission-complete')) {
      update(game, STEP);
      accumulator -= STEP;
    }
    if (game.mode !== 'play' && game.mode !== 'mission-complete') accumulator = 0;
  } else if (game.mode === 'menu') {
    // Slow ambient pan over the city behind the title.
    game.time += elapsed;
    game.camera.x = game.city.spawn.x + Math.cos(game.time * 0.06) * 160;
    game.camera.y = game.city.spawn.y + Math.sin(game.time * 0.06) * 120;
    game.input.clearPressed();
    accumulator = 0;
  } else {
    game.input.clearPressed();
    accumulator = 0;
  }
  render(game);
}

function runShot() {
  // applyShot expects a NUMBER (1-4); the URL query is a string.
  const n = Number.parseInt(shotParam, 10);
  safeCall(game, 'applyShot', () => applyShot(game, Number.isInteger(n) ? n : 0));
  let painted = 0;
  function paint() {
    render(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play') setMode(game, 'paused');
});

announce('SOLMAR. Press Enter or click to start.');
if (shotParam) runShot();
else requestAnimationFrame(frame);
