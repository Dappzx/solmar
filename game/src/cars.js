// cars.js — drivable cars: arcade physics, parked cars to steal, top-down drawing.
// Part of SOLMAR (make.fun gta6-01). Original IP: fictional city Solmar.
import { addWanted } from './police.js';
import { spawnParticles } from './combat.js';
import { hitsBuilding as cityHitsBuilding } from './city.js';

export const CAR_TYPES = {
  sedan: { w: 46, h: 22, accel: 320, maxSpeed: 420, handling: 2.6, color: '#c0392b' },
  taxi:  { w: 46, h: 22, accel: 320, maxSpeed: 420, handling: 2.6, color: '#f1c40f' },
  coupe: { w: 44, h: 20, accel: 420, maxSpeed: 540, handling: 3.1, color: '#e74c3c' },
  truck: { w: 60, h: 26, accel: 220, maxSpeed: 320, handling: 2.0, color: '#7f8c8d' },
  van:   { w: 54, h: 24, accel: 260, maxSpeed: 360, handling: 2.2, color: '#3498db' },
  cop:   { w: 48, h: 22, accel: 380, maxSpeed: 520, handling: 3.0, color: '#20242a' },
};

const PARKED_TYPES = ['sedan', 'taxi', 'coupe', 'van', 'truck'];

function keyDown(input, ...codes) {
  if (!input || !input.keys) return false;
  for (const c of codes) if (input.keys.has(c)) return true;
  return false;
}

// Map our sound names to the real audio object (audio.js: shot/crash/click/...),
// falling back to a generic .play(name) if another audio object is wired in.
const SFX_MAP = { shoot: 'shot', crash: 'crash', click: 'click', thud: 'crash', punch: 'crash', swing: 'click', door: 'click', steal: 'click' };
function sfx(game, name) {
  const a = game.audio;
  if (!a) return;
  const m = SFX_MAP[name] || name;
  if (typeof a[m] === 'function') a[m]();
  else if (typeof a.play === 'function') a.play(name);
}

function hitBuilding(game, x, y, r) {
  const city = game.city;
  if (city && typeof city.hitsBuilding === 'function') return city.hitsBuilding(city, x, y, r);
  if (city && Array.isArray(city.buildings)) return cityHitsBuilding(city, x, y, r);
  if (x < 0 || y < 0 || x > 3200 || y > 3200) return true;
  // Sidewalk-aware fallback: the ~14 px ring around each block (48..62 px
  // from a centerline) is drivable; only the deep block interior is solid.
  const off = (v) => {
    let d = 1e9;
    for (let i = 0; i <= 8; i++) d = Math.min(d, Math.abs(v - (176 + 352 * i)));
    return d;
  };
  return off(x) > 62 && off(y) > 62;
}

export function createCar(type, x, y, angle, driver = null) {
  const model = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    x, y, angle, speed: 0, steer: 0, type,
    color: model.color, driver, health: 100, model,
    playerOwned: false,
  };
}

// ~14 parked cars along road edges, stealable. Guarded so it only runs once.
export function spawnParkedCars(game, n = 14) {
  if (game._parkedSpawned) return;
  game._parkedSpawned = true;
  const px = game.player ? game.player.x : 1584;
  const py = game.player ? game.player.y : 1584;
  let placed = 0, guard = 0;
  while (placed < n && guard++ < 200) {
    const axis = Math.random() < 0.5 ? 'x' : 'y';
    const line = 176 + 352 * Math.floor(Math.random() * 9);
    const along = 220 + Math.random() * 2760;
    const side = Math.random() < 0.5 ? -34 : 34;
    let x, y, angle;
    if (axis === 'x') { x = along; y = line + side; angle = Math.random() < 0.5 ? 0 : Math.PI; }
    else { x = line + side; y = along; angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    if (Math.hypot(x - px, y - py) < 160) continue;
    const type = PARKED_TYPES[Math.floor(Math.random() * PARKED_TYPES.length)];
    game.cars.push(createCar(type, x, y, angle, null));
    placed++;
  }
}

export function updateCars(game, dt) {
  if (!game.cars) return;
  if (!game._parkedSpawned) spawnParkedCars(game);
  const input = game.input;
  for (const car of game.cars) {
    if (car.driver !== 'player') continue;
    const m = car.model;
    const fwd = keyDown(input, 'KeyW', 'w', 'W', 'ArrowUp');
    const back = keyDown(input, 'KeyS', 's', 'S', 'ArrowDown');
    const left = keyDown(input, 'KeyA', 'a', 'A', 'ArrowLeft');
    const right = keyDown(input, 'KeyD', 'd', 'D', 'ArrowRight');
    const brake = keyDown(input, 'Space', ' ');
    const steerTarget = (left ? -1 : 0) + (right ? 1 : 0);

    if (fwd) car.speed += m.accel * dt;
    if (back) {
      if (car.speed > 10) car.speed -= m.accel * 1.2 * dt; // brake
      else car.speed -= m.accel * 0.6 * dt; // reverse
    }
    if (!fwd && !back) car.speed -= car.speed * 0.8 * dt; // rolling drag
    if (brake) { // handbrake: drift, extra steering, speed bleed, skid marks
      car.speed -= car.speed * 1.4 * dt;
      if (Math.abs(car.speed) > 120) {
        spawnParticles(game, car.x - Math.cos(car.angle) * m.w / 2, car.y - Math.sin(car.angle) * m.w / 2,
          { count: 1, color: '#222', type: 'skid', life: 2.2, size: 5, angle: car.angle });
      }
    }
    const maxFwd = m.maxSpeed, maxRev = -m.maxSpeed * 0.4;
    car.speed = Math.max(maxRev, Math.min(maxFwd, car.speed));

    // Steering scales with speed; handbrake makes it sharper.
    car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);
    const spdF = Math.max(-1, Math.min(1, car.speed / m.maxSpeed));
    car.angle += car.steer * m.handling * spdF * (brake ? 1.6 : 1) * dt;

    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const r = Math.min(m.w, m.h) / 2 + 5;
    const before = Math.abs(car.speed);
    // Check the combined diagonal point first: axis-at-a-time checks let a
    // fast car cut building corners a few px per frame.
    let hit = false;
    if (!hitBuilding(game, nx, ny, r)) {
      car.x = nx; car.y = ny;
    } else {
      hit = true;
      let moved = false;
      if (!hitBuilding(game, nx, car.y, r)) { car.x = nx; moved = true; }
      if (!hitBuilding(game, car.x, ny, r)) { car.y = ny; moved = true; }
      if (moved) car.speed *= 0.7; // scrape along the wall
      else if (before > 60) car.speed *= -0.25; // dead-on hit: bounce back
    }
    if (hit && before > 200) {
      // Hard hit: sparks + smoke + sound + damage.
      spawnParticles(game, car.x, car.y, { count: 12, color: ['#f39c12', '#fff', '#888'], speed: 200, life: 0.5, size: 3 });
      spawnParticles(game, car.x, car.y, { count: 6, color: '#777', type: 'smoke', speed: 40, life: 1.2, size: 7 });
      car.health = Math.max(0, car.health - 12);
      sfx(game, 'crash');
    }
    car.x = Math.max(24, Math.min(3176, car.x));
    car.y = Math.max(24, Math.min(3176, car.y));

    // Smoking wreck.
    if (car.health > 0 && car.health < 35 && Math.random() < dt * 6) {
      spawnParticles(game, car.x, car.y - 6, { count: 1, color: '#666', type: 'smoke', speed: 25, life: 1.4, size: 8 });
    }
    // Keep the player glued to the car.
    if (game.player) { game.player.x = car.x; game.player.y = car.y; game.player.angle = car.angle; }
  }

  // Simple car-car push-apart (parked + player cars).
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 30;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        if (a.driver === 'player' || b.driver === 'player') {
          const mv = a.driver === 'player' ? a : b;
          if (Math.abs(mv.speed) > 150) {
            mv.speed *= 0.6;
            spawnParticles(game, (a.x + b.x) / 2, (a.y + b.y) / 2,
              { count: 6, color: ['#f39c12', '#fff'], speed: 150, life: 0.4, size: 3 });
            sfx(game, 'crash');
          }
        }
      }
    }
  }
}

export function enterCar(game) {
  const p = game.player;
  if (!p || !p.onFoot || !game.cars) return false;
  let best = null, bestD = 60;
  for (const car of game.cars) {
    if (car.driver) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  p.onFoot = false;
  p.car = best;
  best.driver = 'player';
  best.speed = 0;
  if (!best.playerOwned) {
    best.playerOwned = true;
    addWanted(game, 1); // stealing any car draws the law
    sfx(game, 'steal');
  } else {
    sfx(game, 'door');
  }
  return true;
}

export function exitCar(game) {
  const p = game.player;
  if (!p || p.onFoot || !p.car) return false;
  const car = p.car;
  car.driver = null;
  car.speed = 0;
  car.playerOwned = true;
  // Step out to the side that is not inside a building.
  const px = Math.cos(car.angle + Math.PI / 2), py = Math.sin(car.angle + Math.PI / 2);
  let sx = car.x + px * 32, sy = car.y + py * 32;
  if (hitBuilding(game, sx, sy, 14)) { sx = car.x - px * 32; sy = car.y - py * 32; }
  p.x = sx; p.y = sy;
  p.angle = car.angle;
  p.speed = 0;
  p.onFoot = true;
  p.car = null;
  sfx(game, 'door');
  return true;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Shared top-down car shape; also used by traffic.js and police.js.
export function drawCarShape(ctx, car) {
  const m = car.model || CAR_TYPES[car.type] || CAR_TYPES.sedan;
  const w = m.w, h = m.h;
  ctx.save();
  ctx.translate(car.x, car.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, w / 2, h / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(car.angle);
  // Wheels.
  ctx.fillStyle = '#111';
  const wx = w / 2 - 8, wy = h / 2 - 1;
  ctx.fillRect(-wx - 4, -wy - 3, 9, 5);
  ctx.fillRect(wx - 5, -wy - 3, 9, 5);
  ctx.fillRect(-wx - 4, wy - 2, 9, 5);
  ctx.fillRect(wx - 5, wy - 2, 9, 5);
  // Body.
  ctx.fillStyle = car.color || m.color;
  rr(ctx, -w / 2, -h / 2, w, h, 6); ctx.fill();
  // Cop: white doors band.
  if (car.type === 'cop') {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(-w / 6, -h / 2 + 1, w / 3, h - 2);
  }
  // Windshield + rear window + roof.
  ctx.fillStyle = 'rgba(180,220,240,0.85)';
  ctx.fillRect(w / 2 - 12, -h / 2 + 3, 6, h - 6);
  ctx.fillRect(-w / 2 + 4, -h / 2 + 3, 5, h - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-6, -h / 2 + 3, 12, h - 6);
  // Headlights / taillights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(w / 2 - 2, -h / 2 + 2, 2, 4);
  ctx.fillRect(w / 2 - 2, h / 2 - 6, 2, 4);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(-w / 2, -h / 2 + 2, 2, 4);
  ctx.fillRect(-w / 2, h / 2 - 6, 2, 4);
  // Taxi roof sign.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 0, 0);
  }
  // Damage smoke hint: darkened hood when wrecked.
  if (car.health !== undefined && car.health < 35) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, w / 2 - 14, -h / 2 + 2, 12, h - 4, 3); ctx.fill();
  }
  ctx.restore();
}

export function drawCars(ctx, game) {
  if (!game.cars) return;
  for (const car of game.cars) drawCarShape(ctx, car);
}
