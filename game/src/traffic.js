// traffic.js — ambient traffic cars + pedestrians on the sidewalks of Solmar.
// Part of SOLMAR (make.fun gta6-01). Original IP: fictional city Solmar.
import { createCar, drawCarShape, CAR_TYPES } from './cars.js';
import { addWanted } from './police.js';
import { spawnParticles } from './combat.js';
import {
  hitsBuilding as cityHitsBuilding,
  randomRoadPoint as cityRandomRoadPoint,
  randomSidewalkPoint as cityRandomSidewalkPoint,
  nearestRoadPoint as cityNearestRoadPoint,
} from './city.js';

const TRAFFIC_TYPES = ['sedan', 'taxi', 'coupe', 'van', 'truck'];
const PED_COLORS = ['#8e44ad', '#16a085', '#d35400', '#2c3e50', '#c0392b', '#7f8c8d', '#2980b9', '#f39c12'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'];

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
  const off = (v) => {
    let d = 1e9;
    for (let i = 0; i <= 8; i++) d = Math.min(d, Math.abs(v - (176 + 352 * i)));
    return d;
  };
  return off(x) > 62 && off(y) > 62;
}

// Move a ped, sliding along buildings instead of walking through them.
// The combined diagonal point is checked first: checking the axes one at a
// time lets a diagonal step cut the corner of a building, a few px per frame.
function movePed(game, ped, nx, ny) {
  if (!hitBuilding(game, nx, ny, 8)) { ped.x = nx; ped.y = ny; return; }
  if (!hitBuilding(game, nx, ped.y, 8)) ped.x = nx;
  if (!hitBuilding(game, ped.x, ny, 8)) ped.y = ny;
}

// A sidewalk point that is not inside a building. city.js's
// randomSidewalkPoint can land inside a building rect where the building
// reaches close to the road, so resample a few times before giving up.
function safeSidewalkPoint(game) {
  for (let i = 0; i < 12; i++) {
    const p = sidewalkPoint(game);
    if (!hitBuilding(game, p.x, p.y, 8)) return p;
  }
  const p = sidewalkPoint(game);
  const city = game.city;
  if (city && typeof city.nearestRoadPoint === 'function') {
    return city.nearestRoadPoint(city, p.x, p.y);
  }
  if (city && city.roads && Array.isArray(city.roads.vertical)) {
    return cityNearestRoadPoint(city, p.x, p.y);
  }
  return p;
}

function roadLine(i) { return 176 + 352 * i; }

function sidewalkPoint(game) {
  const city = game.city;
  if (city && typeof city.randomSidewalkPoint === 'function') {
    const p = city.randomSidewalkPoint(city, Math.random);
    if (p) return p;
  }
  if (city && city.roads && Array.isArray(city.roads.vertical)) {
    const p = cityRandomSidewalkPoint(city, Math.random);
    if (p) return p;
  }
  // Fallback: 62 px off a random road centerline (just past the road edge).
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const line = roadLine(Math.floor(Math.random() * 9));
  const along = 200 + Math.random() * 2800;
  const side = Math.random() < 0.5 ? -62 : 62;
  return axis === 'x' ? { x: along, y: line + side } : { x: line + side, y: along };
}

function roadPoint(game) {
  const city = game.city;
  if (city && typeof city.randomRoadPoint === 'function') {
    const p = city.randomRoadPoint(city, Math.random);
    if (p) return p;
  }
  if (city && city.roads && Array.isArray(city.roads.vertical)) {
    const p = cityRandomRoadPoint(city, Math.random);
    if (p) return p;
  }
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const line = roadLine(Math.floor(Math.random() * 9));
  const along = 200 + Math.random() * 2800;
  return axis === 'x' ? { x: along, y: line } : { x: line, y: along };
}

export function spawnPeds(game, n) {
  if (!game.peds) game.peds = [];
  for (let i = 0; i < n; i++) {
    const p = safeSidewalkPoint(game);
    const t = safeSidewalkPoint(game);
    game.peds.push({
      x: p.x, y: p.y,
      angle: Math.atan2(t.y - p.y, t.x - p.x),
      speed: 40 + Math.random() * 30,
      state: 'walk',
      color: PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)],
      skin: SKIN[Math.floor(Math.random() * SKIN.length)],
      target: t,
      fleeUntil: 0,
      downTimer: 0,
    });
  }
}

function makeTrafficCar(game) {
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const line = roadLine(Math.floor(Math.random() * 9));
  const along = 200 + Math.random() * 2800;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const type = TRAFFIC_TYPES[Math.floor(Math.random() * TRAFFIC_TYPES.length)];
  const x = axis === 'x' ? along : line;
  const y = axis === 'x' ? line : along;
  const angle = axis === 'x' ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? Math.PI / 2 : -Math.PI / 2);
  const car = createCar(type, x, y, angle, 'traffic');
  car.route = { axis, dir };
  car.targetSpeed = 90 + Math.random() * 70;
  car.speed = car.targetSpeed;
  car._lastCross = -1;
  return car;
}

export function spawnTraffic(game) {
  if (!game.traffic) game.traffic = [];
  if (!game.peds) game.peds = [];
  for (let i = 0; i < 12; i++) game.traffic.push(makeTrafficCar(game));
  spawnPeds(game, 24);
}

// Is there a car ahead of `car` on the same lane within `gap` px?
function carAhead(game, car, gap) {
  const all = [];
  if (game.traffic) for (const c of game.traffic) if (c !== car) all.push(c);
  if (game.cars) for (const c of game.cars) all.push(c);
  if (game.cops) for (const cp of game.cops) if (cp.car) all.push(cp.car);
  for (const o of all) {
    if (car.route.axis === 'x') {
      if (Math.abs(o.y - car.y) > 20) continue;
      const ahead = (o.x - car.x) * car.route.dir;
      if (ahead > 0 && ahead < gap) return true;
    } else {
      if (Math.abs(o.x - car.x) > 20) continue;
      const ahead = (o.y - car.y) * car.route.dir;
      if (ahead > 0 && ahead < gap) return true;
    }
  }
  return false;
}

export function updateTraffic(game, dt) {
  const now = game.time || 0;
  const px = game.player ? game.player.x : 1600;
  const py = game.player ? game.player.y : 1600;

  // --- Traffic cars: follow centerlines, turn at intersections, stop for cars ahead.
  if (game.traffic) {
    for (const car of game.traffic) {
      if (!car.route) { car.route = { axis: 'x', dir: 1 }; }
      const blocked = carAhead(game, car, 80);
      const want = blocked ? 0 : car.targetSpeed;
      car.speed += (want - car.speed) * Math.min(1, 2.5 * dt);
      const along = car.route.axis === 'x' ? car.x : car.y;
      // Turn at an intersection (once per crossing).
      let nearestCross = -1, nearestD = 1e9;
      for (let i = 0; i <= 8; i++) {
        const d = Math.abs(along - roadLine(i));
        if (d < nearestD) { nearestD = d; nearestCross = roadLine(i); }
      }
      if (nearestD < 12 && car._lastCross !== nearestCross) {
        car._lastCross = nearestCross;
        if (Math.random() < 0.35) {
          if (car.route.axis === 'x') {
            car.route = { axis: 'y', dir: Math.random() < 0.5 ? 1 : -1 };
            car.x = nearestCross;
            car.angle = car.route.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            car.route = { axis: 'x', dir: Math.random() < 0.5 ? 1 : -1 };
            car.y = nearestCross;
            car.angle = car.route.dir === 1 ? 0 : Math.PI;
          }
        }
      } else if (nearestD > 60) {
        car._lastCross = -1;
      }
      if (car.route.axis === 'x') car.x += car.route.dir * car.speed * dt;
      else car.y += car.route.dir * car.speed * dt;
      // Wrap around the world edge instead of driving off the map.
      if (car.x < 80 || car.x > 3120 || car.y < 80 || car.y > 3120) {
        const fresh = makeTrafficCar(game);
        car.x = fresh.x; car.y = fresh.y; car.angle = fresh.angle;
        car.route = fresh.route; car.targetSpeed = fresh.targetSpeed; car.speed = fresh.speed;
      }
      // Recycle far-away cars to a road near the player so streets stay alive.
      if (Math.hypot(car.x - px, car.y - py) > 1500) {
        const p = roadPoint(game);
        // Snap to the road the point actually sits on: whichever coordinate
        // is closest to a centerline decides the axis (a point on an x-road
        // must keep driving along x, or it ends up off-road).
        const nearLine = (v) => {
          let d = 1e9;
          for (let i = 0; i <= 8; i++) d = Math.min(d, Math.abs(v - roadLine(i)));
          return d;
        };
        const axis = nearLine(p.y) <= nearLine(p.x) ? 'x' : 'y';
        car.route = { axis, dir: Math.random() < 0.5 ? 1 : -1 };
        car.x = p.x; car.y = p.y;
        car.angle = axis === 'x' ? (car.route.dir === 1 ? 0 : Math.PI)
                                 : (car.route.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }

  // --- Pedestrians: stroll the sidewalks, flee gunfire, get run over.
  if (game.peds) {
    const playerCar = game.player && !game.player.onFoot ? game.player.car : null;
    for (const ped of game.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) { ped.state = 'flee'; ped.fleeUntil = now + 3; }
        continue;
      }
      // Flee recent gunfire / explosions.
      const shot = game.lastShot;
      if (shot && now - shot.t < 2 && Math.hypot(ped.x - shot.x, ped.y - shot.y) < 280) {
        ped.state = 'flee';
        ped.fleeUntil = now + 3 + Math.random();
      }
      if (ped.state === 'flee') {
        if (now > ped.fleeUntil) { ped.state = 'walk'; }
        else {
          const away = shot
            ? Math.atan2(ped.y - shot.y, ped.x - shot.x)
            : ped.angle;
          ped.angle = away;
          movePed(game, ped,
            ped.x + Math.cos(away) * 230 * dt,
            ped.y + Math.sin(away) * 230 * dt);
          ped.x = Math.max(16, Math.min(3184, ped.x));
          ped.y = Math.max(16, Math.min(3184, ped.y));
          continue;
        }
      }
      // Walk toward the current sidewalk target, then pick a new one.
      const dx = ped.target.x - ped.x, dy = ped.target.y - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        ped.target = safeSidewalkPoint(game);
      } else {
        ped.angle = Math.atan2(dy, dx);
        const dBefore = d;
        movePed(game, ped,
          ped.x + Math.cos(ped.angle) * ped.speed * dt,
          ped.y + Math.sin(ped.angle) * ped.speed * dt);
        // Stuck against a building (sliding but not closing in)? Retarget.
        const dAfter = Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y);
        ped._stuck = dAfter >= dBefore - 0.5 ? (ped._stuck || 0) + dt : 0;
        if ((ped._stuck || 0) > 1.5) {
          ped.target = safeSidewalkPoint(game);
          ped._stuck = 0;
        }
      }
      // Run over by the player's car at speed: down + wanted.
      if (playerCar && Math.abs(playerCar.speed) > 150) {
        if (Math.hypot(ped.x - playerCar.x, ped.y - playerCar.y) < 30) {
          ped.state = 'down';
          ped.downTimer = 30;
          addWanted(game, 1);
          spawnParticles(game, ped.x, ped.y,
            { count: 14, color: ['#c0392b', '#e74c3c'], speed: 160, life: 0.7, size: 3 });
          sfx(game, 'thud');
        }
      }
    }
  }
}

export function drawTraffic(ctx, game) {
  if (!game.traffic) return;
  for (const car of game.traffic) drawCarShape(ctx, car);
}

export function drawPeds(ctx, game) {
  if (!game.peds) return;
  for (const ped of game.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      // Lying flat.
      ctx.rotate(ped.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(1, 2, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(3, 0, 5, 0, Math.PI * 2); ctx.fill();
    if (ped.state === 'flee') {
      // Panicked arms up.
      ctx.strokeStyle = ped.skin;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-6, -13); ctx.moveTo(-2, 7); ctx.lineTo(-6, 13); ctx.stroke();
    }
    ctx.restore();
  }
}
