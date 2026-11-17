// police.js — wanted level, heat decay, cop cars + foot cops, busts.
// Part of SOLMAR (make.fun gta6-01). Original IP: fictional city Solmar.
import { createCar, drawCarShape } from './cars.js';
import { spawnParticles } from './combat.js';
import { hitsBuilding as cityHitsBuilding, nearestRoadPoint as cityNearestRoadPoint } from './city.js';

const MAX_WANTED = 5;

const SFX_MAP = { shoot: 'shot', crash: 'crash', click: 'click', thud: 'crash', punch: 'crash', swing: 'click', door: 'click', steal: 'click' };
function sfx(game, name) {
  const a = game.audio;
  if (!a) return;
  const m = SFX_MAP[name] || name;
  if (typeof a[m] === 'function') a[m]();
  else if (typeof a.play === 'function') a.play(name);
}

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function hitBuilding(game, x, y, r) {
  const city = game.city;
  if (city && typeof city.hitsBuilding === 'function') return city.hitsBuilding(city, x, y, r);
  if (city && Array.isArray(city.buildings)) return cityHitsBuilding(city, x, y, r);
  if (x < 0 || y < 0 || x > 3200 || y > 3200) return true;
  // Sidewalk-aware fallback: the ~14 px ring around each block (48..62 px
  // from a centerline) is open; only the deep block interior is solid.
  const off = (v) => {
    let d = 1e9;
    for (let i = 0; i <= 8; i++) d = Math.min(d, Math.abs(v - (176 + 352 * i)));
    return d;
  };
  return off(x) > 62 && off(y) > 62;
}

function nearestRoadSnap(game, x, y) {
  const city = game.city;
  if (city && typeof city.nearestRoadPoint === 'function') {
    const p = city.nearestRoadPoint(city, x, y);
    if (p) return p;
  }
  if (city && city.roads && Array.isArray(city.roads.vertical)) {
    return cityNearestRoadPoint(city, x, y);
  }
  // Fallback: snap to the closest road centerline.
  let bx = x, bd = 1e9;
  for (let i = 0; i <= 8; i++) {
    const d = Math.abs(x - (176 + 352 * i));
    if (d < bd) { bd = d; bx = 176 + 352 * i; }
  }
  let by = y; bd = 1e9;
  for (let i = 0; i <= 8; i++) {
    const d = Math.abs(y - (176 + 352 * i));
    if (d < bd) { bd = d; by = 176 + 352 * i; }
  }
  return Math.abs(x - bx) < Math.abs(y - by) ? { x: bx, y } : { x, y: by };
}

export function addWanted(game, n) {
  game.wanted = Math.max(0, Math.min(MAX_WANTED, (game.wanted || 0) + n));
  if (n > 0) {
    game.heat = 100;
    game._hideTimer = 0;
  }
  return game.wanted;
}

export function updateWanted(game, dt) {
  if (!game.cops) game.cops = [];
  const p = game.player;
  if (!p) return;
  let nearest = 1e9;
  for (const cop of game.cops) {
    const cx = cop.car ? cop.car.x : cop.x;
    const cy = cop.car ? cop.car.y : cop.y;
    nearest = Math.min(nearest, Math.hypot(cx - p.x, cy - p.y));
  }
  if ((game.wanted || 0) > 0) {
    if (nearest < 500) {
      game.heat = Math.min(100, (game.heat || 0) + 2 * dt);
      game._hideTimer = 0;
    } else {
      game.heat = Math.max(0, (game.heat || 0) - 7 * dt);
      if ((game.heat || 0) <= 0) {
        game._hideTimer = (game._hideTimer || 0) + dt;
        if (game._hideTimer > 8) {
          game.wanted -= 1;
          game.heat = 40;
          game._hideTimer = 0;
        }
      }
    }
  } else {
    game.heat = Math.max(0, (game.heat || 0) - 10 * dt);
  }
}

// Desired force for each wanted level: cars + foot cops.
function desiredForce(wanted) {
  if (wanted <= 0) return { cars: 0, foot: 0 };
  if (wanted === 1) return { cars: 1, foot: 0 };
  if (wanted === 2) return { cars: 2, foot: 0 };
  if (wanted === 3) return { cars: 2, foot: 1 };
  if (wanted === 4) return { cars: 3, foot: 1 };
  return { cars: 3, foot: 2 };
}

function spawnCopCar(game) {
  const p = game.player;
  const a = Math.random() * Math.PI * 2;
  const d = 500 + Math.random() * 200;
  const spot = nearestRoadSnap(game,
    Math.max(100, Math.min(3100, p.x + Math.cos(a) * d)),
    Math.max(100, Math.min(3100, p.y + Math.sin(a) * d)));
  const car = createCar('cop', spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), 'cop');
  car.speed = 200;
  game.cops.push({ x: spot.x, y: spot.y, angle: car.angle, speed: 0, state: 'chase', car, hp: 100, fireTimer: 0, searchTimer: 0 });
}

function spawnFootCop(game) {
  const p = game.player;
  const a = Math.random() * Math.PI * 2;
  const d = 220 + Math.random() * 120;
  let x = Math.max(40, Math.min(3160, p.x + Math.cos(a) * d));
  let y = Math.max(40, Math.min(3160, p.y + Math.sin(a) * d));
  // Never spawn inside a building: snap to the nearest road.
  if (hitBuilding(game, x, y, 10)) {
    const s = nearestRoadSnap(game, x, y);
    x = s.x; y = s.y;
  }
  game.cops.push({ x, y, angle: Math.atan2(p.y - y, p.x - x), speed: 0, state: 'chase', car: null, hp: 100, fireTimer: 0, searchTimer: 0 });
}

export function updatePolice(game, dt) {
  if (!game.cops) game.cops = [];
  const p = game.player;
  if (!p) return;
  const wanted = game.wanted || 0;
  const want = desiredForce(wanted);

  // Spawn up to the desired force.
  let cars = 0, foot = 0;
  for (const c of game.cops) (c.car ? cars++ : foot++);
  if (wanted > 0) {
    if (cars < want.cars) spawnCopCar(game);
    if (foot < want.foot) spawnFootCop(game);
  }

  for (let i = game.cops.length - 1; i >= 0; i--) {
    const cop = game.cops[i];
    const px = p.x, py = p.y;
    const cx = cop.car ? cop.car.x : cop.x;
    const cy = cop.car ? cop.car.y : cop.y;
    const dist = Math.hypot(px - cx, py - cy);

    if (wanted === 0) {
      // No heat: cops give up the search and leave.
      cop.state = 'search';
      cop.searchTimer = (cop.searchTimer || 0) + dt;
      if (cop.car) {
        cop.car.speed = Math.max(0, cop.car.speed - 200 * dt);
        const nx = cop.car.x + Math.cos(cop.car.angle) * cop.car.speed * dt;
        const ny = cop.car.y + Math.sin(cop.car.angle) * cop.car.speed * dt;
        if (!hitBuilding(game, nx, ny, 16)) { cop.car.x = nx; cop.car.y = ny; }
        else {
          if (!hitBuilding(game, nx, cop.car.y, 16)) cop.car.x = nx;
          if (!hitBuilding(game, cop.car.x, ny, 16)) cop.car.y = ny;
        }
      }
      if (cop.searchTimer > 12 || dist > 900) {
        if (cop.car && game.cars) {
          const k = game.cars.indexOf(cop.car);
          if (k >= 0) game.cars.splice(k, 1);
        }
        game.cops.splice(i, 1);
      }
      continue;
    }

    if (cop.car) {
      const car = cop.car;
      // Wrecked cop car: smoke, then the cop bails out on foot.
      if (car.health <= 0) {
        if (Math.random() < dt * 8) {
          spawnParticles(game, car.x, car.y, { count: 2, color: '#555', type: 'smoke', speed: 30, life: 1.2, size: 8 });
        }
        cop.searchTimer = (cop.searchTimer || 0) + dt;
        if (cop.searchTimer > 4) {
          cop.car = null;
          cop.x = car.x; cop.y = car.y;
          cop.state = 'chase';
          car.driver = null;
        }
        continue;
      }
      // Chase: steer toward the player, ram when close.
      const wantAngle = Math.atan2(py - car.y, px - car.x);
      const diff = clampAngle(wantAngle - car.angle);
      const turn = Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
      car.angle += turn;
      const ramming = dist < 160;
      const target = ramming ? car.model.maxSpeed : car.model.maxSpeed * 0.85;
      car.speed += (target - car.speed) * Math.min(1, 1.6 * dt);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const r = 16;
      // Combined diagonal point first, so a fast cop car can't cut corners.
      if (!hitBuilding(game, nx, ny, r)) { car.x = nx; car.y = ny; }
      else {
        if (!hitBuilding(game, nx, car.y, r)) car.x = nx; else car.speed *= 0.5;
        if (!hitBuilding(game, car.x, ny, r)) car.y = ny; else car.speed *= 0.5;
      }
      cop.x = car.x; cop.y = car.y; cop.angle = car.angle; cop.speed = car.speed;
      // Ram contact with the player's car.
      if (p.car && dist < 52) {
        p.car.health = Math.max(0, (p.car.health || 100) - 25 * dt);
        p.car.speed *= 0.98;
        car.speed *= 0.7;
        if (Math.random() < dt * 10) {
          spawnParticles(game, (car.x + p.car.x) / 2, (car.y + p.car.y) / 2,
            { count: 5, color: ['#f39c12', '#fff'], speed: 150, life: 0.4, size: 3 });
          sfx(game, 'crash');
        }
      }
      // Bust on foot: cop car pulls up and the player is caught standing still.
      if (p.onFoot && dist < 34 && p.speed < 60) {
        game.mode = 'busted';
      }
    } else {
      // Foot cop: run the player down, shoot when the heat is high.
      cop.angle = Math.atan2(py - cop.y, px - cop.x);
      const chaseSpeed = 210;
      const nx = cop.x + Math.cos(cop.angle) * chaseSpeed * dt;
      const ny = cop.y + Math.sin(cop.angle) * chaseSpeed * dt;
      // Slide along buildings instead of running through them.
      if (!hitBuilding(game, nx, ny, 10)) { cop.x = nx; cop.y = ny; }
      else {
        if (!hitBuilding(game, nx, cop.y, 10)) cop.x = nx;
        if (!hitBuilding(game, cop.x, ny, 10)) cop.y = ny;
      }
      cop.speed = chaseSpeed;
      cop.x = Math.max(16, Math.min(3184, cop.x));
      cop.y = Math.max(16, Math.min(3184, cop.y));
      if (dist < 26) {
        if (p.onFoot && p.speed < 80) game.mode = 'busted';
        else if (p.car) {
          // Yanked at the door: slow the car, shake the driver.
          p.car.speed *= (1 - 1.5 * dt);
        }
      }
      if (wanted >= 2 && dist < 320 && dist > 60) {
        cop.fireTimer -= dt;
        if (cop.fireTimer <= 0) {
          cop.fireTimer = 1.1 + Math.random() * 0.5;
          const a = Math.atan2(py - cop.y, px - cop.x) + (Math.random() - 0.5) * 0.2;
          if (!game.bullets) game.bullets = [];
          game.bullets.push({
            x: cop.x + Math.cos(a) * 18, y: cop.y + Math.sin(a) * 18,
            angle: a, speed: 750, life: 0.9, from: 'cop',
          });
          spawnParticles(game, cop.x + Math.cos(a) * 20, cop.y + Math.sin(a) * 20,
            { count: 4, color: ['#f1c40f', '#fff'], speed: 120, life: 0.2, size: 2 });
          sfx(game, 'shoot');
        }
      }
    }
  }
  // Siren wails while any cop is on the scene (audio.siren is idempotent).
  if (game.audio && typeof game.audio.siren === 'function') {
    game.audio.siren(wanted > 0 && game.cops.length > 0);
  }
}

export function drawPolice(ctx, game) {
  if (!game.cops) return;
  const flash = Math.floor((game.time || 0) * 6) % 2 === 0;
  for (const cop of game.cops) {
    if (cop.car) {
      drawCarShape(ctx, cop.car);
      // Strobe light bar, alternating red / blue.
      ctx.save();
      ctx.translate(cop.car.x, cop.car.y);
      ctx.rotate(cop.car.angle);
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
      ctx.beginPath(); ctx.arc(-4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
      ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Strobe glow on the road.
      ctx.fillStyle = flash ? 'rgba(255,45,45,0.12)' : 'rgba(45,107,255,0.12)';
      ctx.beginPath(); ctx.arc(cop.car.x, cop.car.y, 46, 0, Math.PI * 2); ctx.fill();
    } else {
      // Foot cop: navy uniform, cap, badge.
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(1, 2, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(cop.angle);
      ctx.fillStyle = '#1a2f5a';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath(); ctx.arc(3, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d1b33';
      ctx.beginPath(); ctx.arc(2, 0, 5, Math.PI * 0.7, Math.PI * 1.3); ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(8, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
