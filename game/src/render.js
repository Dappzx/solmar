// SOLMAR world renderer: ground, beach, parks, roads, buildings, then every
// live system in a fixed paint order. The camera transform comes from game.camera.
import { COLORS } from './config.js';
import { drawCars } from './cars.js';
import { drawTraffic, drawPeds } from './traffic.js';
import { drawPlayer } from './player.js';
import { drawPolice } from './police.js';
import { drawBullets, drawParticles } from './combat.js';
import { drawMissionMarkers } from './missions.js';

// Small deterministic hash for stable decoration placement (trees, vents).
function hash2(x, y) {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawGround(ctx, game, view) {
  const { city } = game;
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, city.size, city.size);
  // Subtle patch variation so the ground is not one flat slab.
  ctx.fillStyle = COLORS.groundDark;
  for (let gx = 0; gx < 8; gx += 1) {
    for (let gy = 0; gy < 8; gy += 1) {
      if (hash2(gx, gy) < 0.25) ctx.fillRect(gx * 400 + 60, gy * 400 + 60, 220, 220);
    }
  }
  // Beach sand, then the sea along the south edge.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(0, 2940, city.size, 22);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(city.water.x, city.water.y, city.water.w, city.water.h);
  ctx.fillStyle = COLORS.waterDeep;
  for (let x = 0; x < city.size; x += 260) {
    ctx.fillRect(x + 40, 3010, 140, 5);
    ctx.fillRect(x + 120, 3080, 180, 5);
  }
  // Palms along the beach.
  ctx.fillStyle = '#4c8344';
  for (let x = 120; x < city.size; x += 240) {
    if (hash2(x, 7) < 0.6) {
      ctx.beginPath();
      ctx.arc(x, 2950, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Parks with trees.
  for (const park of city.parks) {
    if (park.x > view.right || park.x + park.w < view.left || park.y > view.bottom || park.y + park.h < view.top) continue;
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = COLORS.parkDark;
    ctx.fillRect(park.x + 10, park.y + 10, park.w - 20, park.h - 20);
    ctx.fillStyle = '#3f7a38';
    const trees = 5 + Math.floor(hash2(park.x, park.y) * 4);
    for (let t = 0; t < trees; t += 1) {
      const tx = park.x + 24 + hash2(park.x + t * 31, park.y) * (park.w - 48);
      const ty = park.y + 24 + hash2(park.x, park.y + t * 47) * (park.h - 48);
      ctx.beginPath();
      ctx.arc(tx, ty, 10 + hash2(t, park.x) * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRoads(ctx, game, view) {
  const { city } = game;
  const half = city.roadW / 2;
  // Sidewalk underlay, slightly wider than the asphalt.
  ctx.fillStyle = COLORS.sidewalk;
  for (const vx of city.roads.vertical) ctx.fillRect(vx - half - 8, 0, city.roadW + 16, city.size);
  for (const hy of city.roads.horizontal) ctx.fillRect(0, hy - half - 8, city.size, city.roadW + 16);
  // Asphalt.
  ctx.fillStyle = COLORS.asphalt;
  for (const vx of city.roads.vertical) ctx.fillRect(vx - half, 0, city.roadW, city.size);
  for (const hy of city.roads.horizontal) ctx.fillRect(0, hy - half, city.size, city.roadW);
  // Yellow centre dashes (skipped inside intersections).
  ctx.fillStyle = COLORS.roadLine;
  for (const vx of city.roads.vertical) {
    for (let y = 24; y < city.size; y += 64) {
      if (y < view.top - 40 || y > view.bottom + 40) continue;
      if (city.roads.horizontal.some((hy) => Math.abs(y - hy) < 70)) continue;
      ctx.fillRect(vx - 3, y, 6, 30);
    }
  }
  for (const hy of city.roads.horizontal) {
    for (let x = 24; x < city.size; x += 64) {
      if (x < view.left - 40 || x > view.right + 40) continue;
      if (city.roads.vertical.some((vx) => Math.abs(x - vx) < 70)) continue;
      ctx.fillRect(x, hy - 3, 30, 6);
    }
  }
}

// The getaway yacht at the south dock, drawn top-down in open water just
// south of the coastal road (road ends at y=3040; water runs 2960-3200).
// Fixed position so the "King of Solmar" marker at the dock (1936, 2900)
// always points at a real boat: white hull, teal stripe, cabin with
// windows, mast, and a short wooden pier back to the road.
const YACHT = { x: 1936, y: 3085 };

function drawYacht(ctx, game, view) {
  // Cull when the dock is off-screen.
  if (YACHT.x + 120 < view.left || YACHT.x - 120 > view.right ||
      YACHT.y + 60 < view.top || YACHT.y - 60 > view.bottom) return;
  const { x, y } = YACHT;
  ctx.save();
  // Wooden pier from the road's south edge down to the yacht's stern.
  ctx.fillStyle = '#8a6b45';
  ctx.fillRect(x - 12, 3036, 24, 34);
  ctx.fillStyle = '#6f5636';
  for (let py = 3040; py < 3068; py += 9) ctx.fillRect(x - 12, py, 24, 2);
  ctx.fillStyle = '#5d4a2e';
  ctx.fillRect(x - 12, 3036, 3, 34);
  ctx.fillRect(x + 9, 3036, 3, 34);

  // Soft wake / foam around the hull so it sits in the water, not on it.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, 96, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hull: long white shape, pointed bow to the east, rounded stern.
  ctx.translate(x, y);
  ctx.rotate(-0.06); // moored at a slight angle
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(4, 6, 88, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-82, -20);
  ctx.lineTo(52, -20);
  ctx.quadraticCurveTo(88, -16, 92, 0);
  ctx.quadraticCurveTo(88, 16, 52, 20);
  ctx.lineTo(-82, 20);
  ctx.quadraticCurveTo(-90, 0, -82, -20);
  ctx.closePath();
  ctx.fillStyle = '#f4f6f7';
  ctx.fill();
  ctx.strokeStyle = '#9aa5ad';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Teal sheer stripe along the hull.
  ctx.strokeStyle = '#1f7a8c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-78, -13);
  ctx.lineTo(52, -13);
  ctx.quadraticCurveTo(80, -11, 84, 0);
  ctx.quadraticCurveTo(80, 11, 52, 13);
  ctx.lineTo(-78, 13);
  ctx.stroke();
  // Deck.
  ctx.fillStyle = '#dfe7ea';
  ctx.beginPath();
  ctx.moveTo(-74, -15);
  ctx.lineTo(48, -15);
  ctx.quadraticCurveTo(78, -12, 82, 0);
  ctx.quadraticCurveTo(78, 12, 48, 15);
  ctx.lineTo(-74, 15);
  ctx.quadraticCurveTo(-80, 0, -74, -15);
  ctx.closePath();
  ctx.fill();
  // Cabin: white superstructure with dark windows, aft of the mast.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#9aa5ad';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-52, -11, 62, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#274b63';
  for (let wx = -44; wx <= 2; wx += 12) ctx.fillRect(wx, -5, 8, 10);
  // Mast + boom, top-down: mast dot, boom line, furled sail.
  ctx.strokeStyle = '#5d4a2e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(66, 0);
  ctx.stroke();
  ctx.fillStyle = '#3a2f22';
  ctx.beginPath();
  ctx.arc(18, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8e2d2';
  ctx.fillRect(20, -3, 44, 6);
  // Bow flag.
  ctx.strokeStyle = '#8c2f2f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(84, 0);
  ctx.lineTo(84, -12);
  ctx.stroke();
  ctx.fillStyle = '#d23b2e';
  ctx.beginPath();
  ctx.moveTo(84, -12);
  ctx.lineTo(96, -8);
  ctx.lineTo(84, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBuildings(ctx, game, view) {
  for (const b of game.city.buildings) {
    if (b.x + b.w < view.left || b.x > view.right || b.y + b.h < view.top || b.y > view.bottom) continue;
    // Drop shadow, offset (6, 8) — taller buildings cast a longer shadow.
    const sh = 6 + b.hgt / 22;
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(b.x + sh, b.y + 8, b.w, b.h);
    // Roof slab.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof rim.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Rooftop details: vents / skylights.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (hash2(b.x + cx * 13, b.y + cy * 17) < 0.5) {
          ctx.fillRect(b.x + 9 + cx * 26, b.y + 9 + cy * 26, 10, 10);
        }
      }
    }
    ctx.strokeStyle = COLORS.buildingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
  }
}

// Pickups (cash / health / ammo) — small world-space icons, drawn here because
// no other module owns them.
function drawPickup(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.kind === 'cash') {
    ctx.fillStyle = '#2f9e4f';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eaffea';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
  } else if (p.kind === 'health') {
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d23b2e';
    ctx.fillRect(-2.5, -8, 5, 16);
    ctx.fillRect(-8, -2.5, 16, 5);
  } else {
    // ammo
    ctx.fillStyle = '#e8c33a';
    ctx.fillRect(-11, -8, 22, 16);
    ctx.fillStyle = '#7a5c00';
    ctx.fillRect(-7, -4, 4, 8);
    ctx.fillRect(0, -4, 4, 8);
    ctx.fillRect(7, -4, 4, 8);
  }
  ctx.restore();
}

export function drawWorld(ctx, game) {
  const { camera } = game;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const view = {
    left: camera.x - cw / 2 / camera.zoom - 120,
    top: camera.y - ch / 2 / camera.zoom - 120,
    right: camera.x + cw / 2 / camera.zoom + 120,
    bottom: camera.y + ch / 2 / camera.zoom + 120,
  };

  drawGround(ctx, game, view);
  drawRoads(ctx, game, view);
  drawYacht(ctx, game, view);
  drawBuildings(ctx, game, view);

  for (const p of game.pickups) {
    if (p.x < view.left || p.x > view.right || p.y < view.top || p.y > view.bottom) continue;
    drawPickup(ctx, p);
  }

  // Fixed paint order: world props, then everything alive.
  drawCars(ctx, game);
  drawTraffic(ctx, game);
  drawPeds(ctx, game);
  drawPlayer(ctx, game);
  drawPolice(ctx, game);
  drawBullets(ctx, game);
  drawParticles(ctx, game);
  drawMissionMarkers(ctx, game);

  ctx.restore();
}
