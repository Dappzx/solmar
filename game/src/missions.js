// missions.js — story missions, taxi side-jobs & cash stashes for SOLMAR.
// Original IP: fictional city Solmar, driver-for-hire Jax Moreno.
// World 3200x3200; road centrelines at 176 + 352*i (i = 0..8), road width 96.
import { createCar } from './cars.js';
import { spawnParticles } from './combat.js';
import { saveGame } from './save.js';

// NOTE: no static import from city.js — builder A's city is a `game.city`
// object whose helpers are called as city.randomRoadPoint(city, Math.random)
// (see traffic.js / police.js). Resolve it at runtime with a grid fallback.
function pickRoadPoint(game) {
  const city = game.city;
  try {
    if (city && typeof city.randomRoadPoint === 'function') {
      const p = city.randomRoadPoint(city, Math.random);
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch (e) { /* fall through to the grid fallback */ }
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const line = G(Math.floor(Math.random() * 9));
  const along = 200 + Math.random() * 2800;
  return axis === 'x' ? { x: along, y: line } : { x: line, y: along };
}

const G = (i) => 176 + 352 * i; // road centreline coordinate

export const MISSION_LIST = [
  {
    id: 'fare1', title: 'First Fare', reward: 150,
    briefing: 'Antar klien ke Hotel Meridian.',
    start: { x: G(2), y: G(3) },
    objectives: [
      { type: 'goto', x: G(2), y: G(3), text: 'Jemput klien di halte', radius: 60 },
      { type: 'goto', x: G(7), y: G(1), text: 'Antar ke Hotel Meridian', radius: 70 },
    ],
  },
  {
    id: 'hotwheels', title: 'Hot Wheels', reward: 300,
    briefing: 'Curi coupe merah di dermaga, antar ke bengkel.',
    start: { x: G(2), y: 2900 },
    objectives: [
      { type: 'steal', carType: 'coupe', x: G(2), y: 2900, text: 'Curi coupe merah di dermaga', radius: 90 },
      { type: 'driveTo', x: G(1), y: G(6), text: 'Antar ke bengkel Rico', radius: 70 },
    ],
  },
  {
    id: 'heat', title: 'Heat Wave', reward: 200,
    briefing: 'Polisi mengincarmu. Hilangkan bintang wanted.',
    start: { x: G(4), y: G(4) },
    objectives: [
      { type: 'gainHeat', stars: 2, text: 'Buat keonaran sampai 2 bintang' },
      { type: 'loseHeat', text: 'Kabur sampai wanted hilang' },
    ],
  },
  {
    id: 'drop', title: 'The Drop', reward: 450,
    briefing: 'Antar paket ke seberang kota selagi diburu.',
    start: { x: G(4), y: G(4) },
    objectives: [
      { type: 'goto', x: G(4), y: G(4), text: 'Ambil paket di pasar', radius: 60 },
      { type: 'driveTo', x: G(7), y: G(7), text: 'Antar paket ke menara kembar', radius: 70 },
    ],
  },
  {
    id: 'king', title: 'King of Solmar', reward: 800,
    briefing: 'Pelarian terakhir ke yacht. Bertahan dari 3 bintang.',
    start: { x: G(5), y: 2900 },
    objectives: [
      { type: 'gainHeat', stars: 3, text: 'Pancing 3 bintang' },
      { type: 'driveTo', x: G(5), y: 2900, text: 'Capai yacht di dermaga', radius: 80 },
    ],
  },
];

// Fixed cash-stash spots (sidewalk offsets next to real road points).
const CASH_SPOTS = [
  [G(0) + 70, G(1)], [G(2), G(0) + 70], [G(4) + 70, G(2)], [G(6), G(1) + 70],
  [G(1) + 70, G(4)], [G(5), G(3) + 70], [G(7) + 70, G(5)], [G(3), G(6) + 70],
  [G(8) - 70, G(3)], [G(2) + 70, G(7)],
];

function now(game) { return game.time || 0; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function toast(game, text, secs = 3) {
  game.toast = { text, until: now(game) + secs };
}
function celebrate(game, x, y) {
  try {
    spawnParticles(game, x, y, { count: 24, color: '#ffd23f', speed: 160, life: 0.6, size: 3 });
  } catch (e) { /* particles optional */ }
}

/** Make sure the 10 'cash' pickups exist (called on mission start / every tick). */
export function ensureCashPickups(game) {
  if (!game.pickups) game.pickups = [];
  if (game.pickups.some((p) => p.kind === 'cash' && !p.taken)) return;
  for (const [x, y] of CASH_SPOTS) {
    game.pickups.push({ x, y, kind: 'cash', taken: false });
  }
}

function currentObjective(game) {
  const a = game.missions && game.missions.active;
  if (!a) return null;
  return MISSION_LIST[a.index].objectives[a.objectiveIndex] || null;
}

function spawnRedCoupe(game) {
  const x = G(2), y = 2900;
  const exists = (game.cars || []).some(
    (c) => c.type === 'coupe' && dist(c.x, c.y, x, y) < 300,
  );
  if (exists) return;
  // Real car shape from cars.js: createCar(type, x, y, angle, driver);
  // model is a CAR_TYPES object, type is the string key, color overridable.
  const coupe = createCar('coupe', x, y, -Math.PI / 2, null);
  coupe.color = 'red';
  game.cars.push(coupe);
}

export function startMission(game, i) {
  const m = MISSION_LIST[i];
  if (!m || !game.missions) return false;
  if (game.missions.active) return false; // never restart over a live mission
  game.missions.active = { index: i, id: m.id, objectiveIndex: 0, startedAt: now(game) };
  game.missionPrompt = null;
  if (m.id === 'hotwheels') spawnRedCoupe(game);
  ensureCashPickups(game);
  toast(game, `${m.title}: ${m.briefing}`, 4);
  return true;
}

function completeMission(game) {
  const a = game.missions.active;
  const m = MISSION_LIST[a.index];
  game.money = (game.money || 0) + m.reward;
  game.respect = (game.respect || 0) + 10 + a.index * 5;
  game.missions.done.push(m.id);
  game.missions.index = a.index + 1;
  game.missions.active = null;
  game.mode = 'mission-complete';
  game.modeUntil = now(game) + 2.5;
  celebrate(game, game.player.x, game.player.y);
  try { if (game.audio && typeof game.audio.missionOk === 'function') game.audio.missionOk(); } catch (e) { /* audio optional */ }
  toast(game, `Misi selesai! +$${m.reward}  (+${10 + a.index * 5} respect)`, 4);
  try { saveGame(game); } catch (e) { /* save is best-effort */ }
}

function objectiveDone(game, obj) {
  const p = game.player;
  if (!p) return false;
  switch (obj.type) {
    case 'goto':
    case 'driveTo':
      return dist(p.x, p.y, obj.x, obj.y) < (obj.radius || 70);
    case 'steal': {
      const car = p.car;
      if (!car || p.onFoot) return false;
      // Real car shape: type is the string key, model is a CAR_TYPES object.
      const isCoupe = car.type === 'coupe';
      const c = String(car.color || '');
      const red = !car.color || /red/i.test(c)
        || ['#ff0000', '#e02020', '#c0392b', '#e74c3c'].includes(c.toLowerCase());
      return isCoupe && red;
    }
    case 'gainHeat':
      return (game.wanted || 0) >= (obj.stars || 1);
    case 'loseHeat':
      return (game.wanted || 0) <= 0;
    default:
      return false;
  }
}

function updateTaxi(game) {
  const p = game.player;
  if (!p) return;
  // Active fare: reached the destination?
  if (game.taxiFare) {
    const f = game.taxiFare;
    if (dist(p.x, p.y, f.x, f.y) < (f.radius || 70)) {
      game.money = (game.money || 0) + f.reward;
      game.respect = (game.respect || 0) + 1;
      toast(game, `Fare selesai! +$${f.reward}`, 3);
      game.taxiFare = null;
    }
    return;
  }
  const inTaxi = p.car && p.car.type === 'taxi';
  if (!inTaxi || p.onFoot) { game.taxiOffer = null; return; }
  const ped = (game.peds || []).find((pd) => !pd.fareDone && dist(p.x, p.y, pd.x, pd.y) < 80);
  if (!ped) { game.taxiOffer = null; return; }
  if (!game.taxiOffer || game.taxiOffer.ped !== ped) {
    game.taxiOffer = { ped, reward: 20 + Math.floor(Math.random() * 41) };
  }
  if (game.input && game.input.pressed && game.input.pressed.has('KeyE')) {
    const dest = pickRoadPoint(game);
    game.taxiFare = { x: dest.x, y: dest.y, radius: 70, reward: game.taxiOffer.reward };
    ped.fareDone = true;
    toast(game, `Antar penumpang (+$${game.taxiFare.reward})`, 3);
    game.taxiOffer = null;
  }
}

export function updateMissions(game, dt) {
  if (!game.missions) return;
  ensureCashPickups(game);
  // Mission-complete splash expires back to normal play.
  if (game.mode === 'mission-complete' && now(game) > (game.modeUntil || 0)) {
    game.mode = 'play';
  }
  updateTaxi(game);
  const active = game.missions.active;
  if (!active) {
    // No active mission: prompt when the player nears the next mission start.
    const next = MISSION_LIST[game.missions.index];
    game.missionPrompt = null;
    if (next && game.player) {
      const s = next.start;
      if (dist(game.player.x, game.player.y, s.x, s.y) < 110) {
        game.missionPrompt = `Tekan E untuk mulai misi: ${next.title}`;
        if (game.input && game.input.pressed && game.input.pressed.has('KeyE')) {
          startMission(game, game.missions.index);
        }
      }
    }
    return;
  }
  const obj = currentObjective(game);
  if (!obj) { game.missions.active = null; return; }
  if (objectiveDone(game, obj)) {
    const m = MISSION_LIST[active.index];
    celebrate(game, game.player.x, game.player.y);
    active.objectiveIndex += 1;
    if (active.objectiveIndex >= m.objectives.length) {
      completeMission(game);
    } else {
      toast(game, MISSION_LIST[active.index].objectives[active.objectiveIndex].text, 3);
    }
  }
}

/** World-space markers: pulsing target, direction line, labels. Call inside the world transform. */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function drawMissionMarkers(ctx, game) {
  if (!game.player) return;
  const t = now(game);
  const pulse = 1 + 0.18 * Math.sin(t * 6);
  const p = game.player;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';

  let target = null;
  let label = '';
  let color = '#ffd23f';
  const active = game.missions && game.missions.active;
  if (active) {
    const obj = currentObjective(game);
    if (obj) {
      label = obj.text || '';
      if (typeof obj.x === 'number') target = { x: obj.x, y: obj.y };
    }
  } else {
    const next = game.missions && MISSION_LIST[game.missions.index];
    if (next) {
      target = { x: next.start.x, y: next.start.y };
      label = `Misi: ${next.title}`;
    }
  }
  if (game.taxiFare) {
    // Green $ marker for the active taxi fare destination.
    ctx.strokeStyle = '#37d67a';
    ctx.fillStyle = '#37d67a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(game.taxiFare.x, game.taxiFare.y, 22 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('$', game.taxiFare.x, game.taxiFare.y + 7);
  }
  if (!target) {
    // Heat objective with no fixed point: ring around the player instead.
    if (active) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, p.x, p.y - 56);
    }
    ctx.restore();
    return;
  }
  // Dashed direction line from player to target.
  ctx.strokeStyle = 'rgba(255, 210, 63, 0.65)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Pulsing ground marker.
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.x, target.y, 8, 0, Math.PI * 2);
  ctx.fill();
  // Label + distance.
  const d = Math.round(dist(p.x, p.y, target.x, target.y) / 50);
  ctx.fillStyle = '#111';
  const text = `${label}  •  ${d}m`;
  const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = 'rgba(255, 210, 63, 0.92)';
  rr(ctx, target.x - w / 2, target.y - 66, w, 26, 6);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillText(text, target.x, target.y - 47);
  ctx.restore();
}
