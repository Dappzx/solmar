// combat.js — shooting, melee, bullets, particles (sparks, smoke, blood, skid marks).
// Part of SOLMAR (make.fun gta6-01). Original IP: fictional city Solmar.
import { addWanted } from './police.js';
import { hitsBuilding as cityHitsBuilding } from './city.js';

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
  // from a centerline) is open; only the deep block interior is solid.
  const off = (v) => {
    let d = 1e9;
    for (let i = 0; i <= 8; i++) d = Math.min(d, Math.abs(v - (176 + 352 * i)));
    return d;
  };
  return off(x) > 62 && off(y) > 62;
}

export function shoot(game) {
  const p = game.player;
  if (!p) return;
  if (!game.bullets) game.bullets = [];

  if (p.weapon === 'pistol') {
    if ((p.ammo || 0) <= 0) { sfx(game, 'click'); return; }
    p.ammo -= 1;
    const m = game.input && game.input.mouse;
    const aim = (m && m.wx !== undefined)
      ? Math.atan2(m.wy - p.y, m.wx - p.x)
      : p.angle;
    game.bullets.push({
      x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
      angle: aim, speed: 950, life: 0.9, from: 'player',
    });
    spawnParticles(game, p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22,
      { count: 5, color: ['#f1c40f', '#fff', '#f39c12'], speed: 140, life: 0.18, size: 2 });
    game.lastShot = { x: p.x, y: p.y, t: game.time || 0 };
    sfx(game, 'shoot');
    return;
  }

  // Fists: short-range swing in the facing direction.
  const reach = 46;
  let hitAnything = false;
  if (game.peds) {
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - p.x, ped.y - p.y);
      if (d < reach) {
        ped.state = 'down';
        ped.downTimer = 30;
        addWanted(game, 1);
        spawnParticles(game, ped.x, ped.y,
          { count: 10, color: ['#c0392b', '#e74c3c'], speed: 140, life: 0.6, size: 3 });
        hitAnything = true;
      }
    }
  }
  if (game.cops) {
    for (const cop of game.cops) {
      if (cop.car) continue;
      const d = Math.hypot(cop.x - p.x, cop.y - p.y);
      if (d < reach) {
        cop.hp -= 25;
        spawnParticles(game, cop.x, cop.y,
          { count: 8, color: ['#c0392b', '#e74c3c'], speed: 130, life: 0.5, size: 3 });
        hitAnything = true;
      }
    }
  }
  spawnParticles(game, p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26,
    { count: 3, color: '#ddd', speed: 60, life: 0.2, size: 2 });
  game.lastShot = { x: p.x, y: p.y, t: game.time || 0 };
  sfx(game, hitAnything ? 'punch' : 'swing');
}

export function updateBullets(game, dt) {
  if (!game.bullets) return;
  const p = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0;

    if (!dead && hitBuilding(game, b.x, b.y, 2)) {
      spawnParticles(game, b.x, b.y,
        { count: 6, color: ['#f39c12', '#fff', '#bbb'], speed: 160, life: 0.35, size: 2 });
      dead = true;
    }

    if (!dead && b.from === 'player') {
      // Pedestrians.
      if (game.peds) {
        for (const ped of game.peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 16) {
            ped.state = 'down';
            ped.downTimer = 30;
            addWanted(game, 1);
            spawnParticles(game, ped.x, ped.y,
              { count: 14, color: ['#c0392b', '#e74c3c'], speed: 170, life: 0.7, size: 3 });
            dead = true;
            break;
          }
        }
      }
      // Foot cops.
      if (!dead && game.cops) {
        for (let c = game.cops.length - 1; c >= 0; c--) {
          const cop = game.cops[c];
          if (cop.car) continue;
          if (Math.hypot(cop.x - b.x, cop.y - b.y) < 16) {
            cop.hp -= 34;
            spawnParticles(game, cop.x, cop.y,
              { count: 10, color: ['#c0392b', '#e74c3c'], speed: 150, life: 0.6, size: 3 });
            if (cop.hp <= 0) {
              game.cops.splice(c, 1);
              addWanted(game, 1);
              spawnParticles(game, cop.x, cop.y,
                { count: 18, color: ['#c0392b', '#e74c3c', '#888'], speed: 200, life: 0.8, size: 3 });
            }
            dead = true;
            break;
          }
        }
      }
      // Cop cars.
      if (!dead && game.cops) {
        for (const cop of game.cops) {
          if (!cop.car) continue;
          if (Math.hypot(cop.car.x - b.x, cop.car.y - b.y) < 34) {
            cop.car.health = Math.max(0, cop.car.health - 20);
            spawnParticles(game, b.x, b.y,
              { count: 7, color: ['#f39c12', '#fff'], speed: 180, life: 0.4, size: 2 });
            if (cop.car.health <= 0) {
              spawnParticles(game, cop.car.x, cop.car.y,
                { count: 16, color: ['#555', '#888', '#f39c12'], type: 'smoke', speed: 60, life: 1.4, size: 8 });
            }
            dead = true;
            break;
          }
        }
      }
      // Traffic cars (shooting up the street has consequences).
      if (!dead && game.traffic) {
        for (const car of game.traffic) {
          if (Math.hypot(car.x - b.x, car.y - b.y) < 32) {
            car.health = Math.max(0, car.health - 20);
            car.targetSpeed = 0; // shot drivers stop
            spawnParticles(game, b.x, b.y,
              { count: 7, color: ['#f39c12', '#fff'], speed: 180, life: 0.4, size: 2 });
            dead = true;
            break;
          }
        }
      }
    }

    if (!dead && b.from === 'cop' && p) {
      if (p.onFoot) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < 14) {
          p.health = Math.max(0, p.health - 12);
          spawnParticles(game, p.x, p.y,
            { count: 10, color: ['#c0392b', '#e74c3c'], speed: 150, life: 0.6, size: 3 });
          if (p.health <= 0) game.mode = 'busted';
          dead = true;
        }
      } else if (p.car) {
        if (Math.hypot(p.car.x - b.x, p.car.y - b.y) < 34) {
          p.car.health = Math.max(0, p.car.health - 15);
          spawnParticles(game, b.x, b.y,
            { count: 7, color: ['#f39c12', '#fff'], speed: 180, life: 0.4, size: 2 });
          dead = true;
        }
      }
    }

    if (dead) game.bullets.splice(i, 1);
  }
}

export function drawBullets(ctx, game) {
  if (!game.bullets) return;
  ctx.save();
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  for (const b of game.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 10, b.y - Math.sin(b.angle) * 10);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function spawnParticles(game, x, y, opts = {}) {
  if (!game.particles) game.particles = [];
  const count = opts.count || 10;
  const colors = Array.isArray(opts.color) ? opts.color : [opts.color || '#fff'];
  const speed = opts.speed !== undefined ? opts.speed : 120;
  const life = opts.life || 0.5;
  const size = opts.size || 3;
  const type = opts.type || 'spark';
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    game.particles.push({
      x, y,
      vx: type === 'skid' ? 0 : Math.cos(a) * s,
      vy: type === 'skid' ? 0 : Math.sin(a) * s,
      life: life * (0.7 + Math.random() * 0.6),
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: size * (0.7 + Math.random() * 0.6),
      type,
      angle: opts.angle || 0,
    });
  }
}

export function updateParticles(game, dt) {
  if (!game.particles) return;
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pt = game.particles[i];
    if (pt.type !== 'skid') {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.type === 'smoke') { pt.vy -= 25 * dt; pt.vx *= (1 - 1.5 * dt); }
      else pt.vy += 260 * dt; // sparks / blood fall
    }
    pt.life -= dt;
    if (pt.life <= 0) game.particles.splice(i, 1);
  }
}

export function drawParticles(ctx, game) {
  if (!game.particles) return;
  for (const pt of game.particles) {
    const f = Math.max(0, pt.life / pt.maxLife);
    if (pt.type === 'skid') {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.angle);
      ctx.fillStyle = `rgba(20,20,20,${0.35 * f})`;
      ctx.fillRect(-7, -2.5, 14, 5);
      ctx.restore();
      continue;
    }
    if (pt.type === 'smoke') {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = 0.35 * f;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.6 - f * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = f;
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * f + 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
