// player.js — Jax Moreno on foot: WASD movement, building slide, enter/exit car.
// Part of SOLMAR (make.fun gta6-01). Original IP: fictional city Solmar, hero Jax Moreno.
import { enterCar, exitCar } from './cars.js';
import { spawnParticles } from './combat.js';
import { hitsBuilding as cityHitsBuilding } from './city.js';

const WALK_SPEED = 170;
const RUN_SPEED = 260;
const PLAYER_RADIUS = 14;

function keyDown(input, ...codes) {
  if (!input || !input.keys) return false;
  for (const c of codes) if (input.keys.has(c)) return true;
  return false;
}

// Building test, in order of preference:
//  1. helper attached to the city object by main.js (city.hitsBuilding),
//  2. the real city.js helper (works when game.city is a createCity object),
//  3. a grid fallback for stubs (roads at 176 + 352*i, width 96).
// Sidewalk-aware: the ~14 px ring around each block (48..62 px from a
// centerline) is walkable; only the deep block interior is solid. Point test;
// the real city.js handles radii.
function hitBuilding(game, x, y, r) {
  const city = game.city;
  if (city && typeof city.hitsBuilding === 'function') return city.hitsBuilding(city, x, y, r);
  if (city && Array.isArray(city.buildings)) return cityHitsBuilding(city, x, y, r);
  if (x < 0 || y < 0 || x > 3200 || y > 3200) return true;
  const off = (v) => {
    let d = 1e9;
    for (let i = 0; i <= 8; i++) d = Math.min(d, Math.abs(v - (176 + 352 * i)));
    return d;
  };
  return off(x) > 62 && off(y) > 62;
}

export function createPlayer(city) {
  const s = (city && city.spawn) || { x: 1584, y: 1584 };
  return {
    x: s.x, y: s.y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null, health: 100, weapon: 'fists', ammo: 0,
  };
}

export function updatePlayer(game, dt) {
  const p = game.player;
  const input = game.input;
  if (!p) return;

  // E: enter / exit car (edge-triggered via input.pressed).
  if (input && input.pressed &&
      (input.pressed.has('KeyE') || input.pressed.has('e') || input.pressed.has('E'))) {
    if (p.onFoot) enterCar(game);
    else exitCar(game);
  }

  if (!p.onFoot) {
    // Riding: stick to the car; cars.js owns the physics.
    if (p.car) { p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle; p.speed = p.car.speed; }
    return;
  }

  let dx = 0, dy = 0;
  if (keyDown(input, 'KeyW', 'w', 'W', 'ArrowUp')) dy -= 1;
  if (keyDown(input, 'KeyS', 's', 'S', 'ArrowDown')) dy += 1;
  if (keyDown(input, 'KeyA', 'a', 'A', 'ArrowLeft')) dx -= 1;
  if (keyDown(input, 'KeyD', 'd', 'D', 'ArrowRight')) dx += 1;
  const run = keyDown(input, 'ShiftLeft', 'ShiftRight', 'Shift');
  const spd = run ? RUN_SPEED : WALK_SPEED;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len; dy /= len;
    p.speed = spd;
    // Slide along buildings: try x, then y.
    const nx = p.x + dx * spd * dt;
    if (!hitBuilding(game, nx, p.y, PLAYER_RADIUS)) p.x = nx;
    const ny = p.y + dy * spd * dt;
    if (!hitBuilding(game, p.x, ny, PLAYER_RADIUS)) p.y = ny;
    // Face movement, unless aiming the pistol at the mouse.
    if (!(p.weapon === 'pistol' && input && input.mouse)) p.angle = Math.atan2(dy, dx);
    // Sprinting kicks up dust.
    if (run && Math.random() < dt * 8) {
      spawnParticles(game, p.x - dx * 10, p.y - dy * 10,
        { count: 1, color: '#b8a888', type: 'smoke', speed: 15, life: 0.5, size: 4 });
    }
  } else {
    p.speed = 0;
  }
  if (p.weapon === 'pistol' && input && input.mouse && input.mouse.wx !== undefined) {
    p.angle = Math.atan2(input.mouse.wy - p.y, input.mouse.wx - p.x);
  }
  p.x = Math.max(16, Math.min(3184, p.x));
  p.y = Math.max(16, Math.min(3184, p.y));
}

export function drawPlayer(ctx, game) {
  const p = game.player;
  if (!p || !p.onFoot) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  // Body (orange jacket) + shoulders.
  ctx.fillStyle = '#e67e22';
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d35400';
  ctx.beginPath(); ctx.arc(-3, -8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-3, 8, 5, 0, Math.PI * 2); ctx.fill();
  // Head.
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(2, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c1a0e';
  ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI * 0.6, Math.PI * 1.4); ctx.fill();
  // Facing nose / gun.
  if (p.weapon === 'pistol') {
    ctx.fillStyle = '#222';
    ctx.fillRect(10, -2, 14, 4);
    ctx.fillStyle = '#888';
    ctx.fillRect(20, -1, 4, 2);
  } else {
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(12, 0, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
