// hud.js — screen-space HUD + minimap for SOLMAR.
// Both functions draw in screen space: call them after ctx.restore()
// (i.e. outside the camera/world transform).
import { MISSION_LIST } from './missions.js';

const G = (i) => 176 + 352 * i; // road centreline coordinate (world 3200x3200)

// roundRect with a plain-rect fallback (stub contexts may lack roundRect).
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawStar(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
  rr(ctx, x, y, w, h, 8);
  ctx.fill();
}

export function drawHUD(ctx, game) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const t = game.time || 0;
  const p = game.player || {};
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // --- Top-left: health bar, money, respect.
  panel(ctx, 14, 14, 240, 86);
  const hp = Math.max(0, Math.min(100, p.health ?? 100));
  ctx.fillStyle = '#222';
  rr(ctx, 26, 26, 196, 16, 4);
  ctx.fill();
  ctx.fillStyle = hp > 50 ? '#37d67a' : hp > 25 ? '#ffb020' : '#e5484d';
  if (hp > 0) {
    rr(ctx, 26, 26, 196 * (hp / 100), 16, 4);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`HP ${Math.round(hp)}`, 30, 34);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#7dff9b';
  ctx.fillText(`$ ${game.money ?? 0}`, 26, 62);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#cdd7e1';
  ctx.fillText(`Respect ${game.respect ?? 0}`, 150, 62);
  ctx.fillText(`Jax Moreno`, 26, 86);

  // --- Wanted stars, top-centre (1-5, gold).
  const wanted = Math.max(0, Math.min(5, game.wanted || 0));
  panel(ctx, W / 2 - 95, 14, 190, 40);
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, W / 2 - 68 + i * 34, 34, 12, i < wanted ? '#ffd23f' : '#3a4757');
  }

  // --- Active mission objective, under the health panel.
  const active = game.missions && game.missions.active;
  if (active) {
    const m = MISSION_LIST[active.index];
    const title = (m && m.title) || 'Misi';
    const obj = (m && m.objectives && m.objectives[active.objectiveIndex]) || null;
    const objText = (obj && obj.text) || '';
    let distText = '';
    if (obj && typeof obj.x === 'number' && p.x !== undefined) {
      distText = `  •  ${Math.round(Math.hypot(p.x - obj.x, p.y - obj.y) / 50)}m`;
    }
    panel(ctx, 14, 110, 320, 52);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(title, 26, 128);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(objText + distText, 26, 148);
  } else if (game.missions && game.missions.index < MISSION_LIST.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px sans-serif';
    ctx.fillText('Ikuti marker kuning untuk misi berikutnya.', 16, 122);
  }

  // --- Toast message, centre-top.
  if (game.toast && t < game.toast.until) {
    ctx.font = 'bold 15px sans-serif';
    const w = ctx.measureText(game.toast.text).width + 28;
    panel(ctx, W / 2 - w / 2, 64, w, 34);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(game.toast.text, W / 2, 82);
    ctx.textAlign = 'left';
  }

  // --- Mission-complete banner.
  if (game.mode === 'mission-complete') {
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('MISI SELESAI!', W / 2, H / 2 - 40);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Hadiah sudah masuk. Misi berikutnya menanti.', W / 2, H / 2 - 8);
    ctx.textAlign = 'left';
  }

  // --- Bottom-left: weapon + ammo.
  panel(ctx, 14, H - 56, 190, 42);
  const weapon = p.weapon || 'fists';
  const ammo = weapon === 'fists' ? '∞' : String(p.ammo ?? 0);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(weapon === 'fists' ? 'Tangan kosong' : weapon === 'pistol' ? 'Pistol' : weapon, 26, H - 35);
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'right';
  ctx.fillText(ammo, 190, H - 35);
  ctx.textAlign = 'left';

  // --- Bottom-right: speed when driving.
  if (p.car && !p.onFoot) {
    const kmh = Math.round(Math.abs(p.car.speed || p.speed || 0) * 0.22);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${kmh}`, W - 26, H - 46);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cdd7e1';
    ctx.fillText('km/h', W - 26, H - 20);
    ctx.textAlign = 'left';
  }

  // --- Bottom-centre prompts (mission start / taxi offer).
  let prompt = game.missionPrompt || null;
  if (game.taxiOffer) prompt = `Taxi: antar penumpang? Tekan E  (+$${game.taxiOffer.reward})`;
  if (game.taxiFare) prompt = 'Antar penumpang ke marker hijau $';
  if (prompt) {
    ctx.font = 'bold 15px sans-serif';
    const w = ctx.measureText(prompt).width + 28;
    const pulse = 0.72 + 0.1 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(8, 12, 20, ${pulse})`;
    rr(ctx, W / 2 - w / 2, H - 52, w, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(prompt, W / 2, H - 34);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export function drawMinimap(ctx, game) {
  const W = ctx.canvas.width;
  const size = 180;
  const x0 = W - size - 14;
  const y0 = 14;
  const s = size / 3200;
  const t = game.time || 0;
  ctx.save();
  // Background + border.
  ctx.fillStyle = 'rgba(8, 12, 20, 0.8)';
  rr(ctx, x0, y0, size, size, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  rr(ctx, x0, y0, size, size, 8);
  ctx.clip();
  // City blocks.
  ctx.fillStyle = '#141d2b';
  ctx.fillRect(x0, y0, size, size);
  // Roads (grid, width 96 world px).
  ctx.strokeStyle = '#3d4c60';
  ctx.lineWidth = Math.max(2, 96 * s);
  for (let i = 0; i < 9; i++) {
    const c = x0 + G(i) * s;
    ctx.beginPath(); ctx.moveTo(c, y0); ctx.lineTo(c, y0 + size); ctx.stroke();
    const r = y0 + G(i) * s;
    ctx.beginPath(); ctx.moveTo(x0, r); ctx.lineTo(x0 + size, r); ctx.stroke();
  }
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + wx * s, y0 + wy * s, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Traffic (white), peds (grey).
  for (const c of game.traffic || []) dot(c.x, c.y, '#e8eef4', 2);
  for (const pd of game.peds || []) dot(pd.x, pd.y, '#8a97a5', 1.5);
  // Mission target (yellow, pulsing ring).
  let mx = null, my = null;
  const active = game.missions && game.missions.active;
  if (active) {
    const m = MISSION_LIST[active.index];
    const obj = m && m.objectives && m.objectives[active.objectiveIndex];
    if (obj && typeof obj.x === 'number') { mx = obj.x; my = obj.y; }
  }
  if (mx === null && game.missions) {
    const next = MISSION_LIST[game.missions.index];
    if (next && next.start) { mx = next.start.x; my = next.start.y; }
  }
  if (mx !== null) {
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + mx * s, y0 + my * s, 5 + 2 * Math.sin(t * 6), 0, Math.PI * 2);
    ctx.stroke();
    dot(mx, my, '#ffd23f', 3.5);
  }
  // Cops (blink red/blue).
  const copColor = Math.floor(t * 2) % 2 === 0 ? '#ff5252' : '#4d8dff';
  for (const c of game.cops || []) dot(c.x, c.y, copColor, 3.5);
  // Player (green + white ring).
  if (game.player) {
    dot(game.player.x, game.player.y, '#37d67a', 4);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + game.player.x * s, y0 + game.player.y * s, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // Label under the box.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLMAR', x0 + size / 2, y0 + size + 13);
  ctx.restore();
}
