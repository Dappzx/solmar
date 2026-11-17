// SOLMAR city generation: a 3200x3200 road grid with blocks, pastel buildings,
// parks and a beach strip along the south edge. Deterministic per seed.
import { WORLD_SIZE, ROAD_W, ROAD_GAP, BLOCK, BUILDING_COLORS, ROOF_COLORS } from './config.js';
import { mulberry32, randRange, randInt, pick } from './random.js';

// Road centrelines: 176, 528, 880, 1232, 1584, 1936, 2288, 2640, 2992.
export function roadLines() {
  const lines = [];
  for (let i = 0; i < 9; i += 1) lines.push(176 + ROAD_GAP * i);
  return lines;
}

export function createCity(seed = 1337) {
  const rng = mulberry32(seed);
  const vertical = roadLines();
  const horizontal = roadLines();
  const halfRoad = ROAD_W / 2;

  // Pick park blocks first so buildings never land on them.
  const parks = [];
  const parkKeys = new Set();
  let guard = 0;
  while (parks.length < 7 && guard < 400) {
    guard += 1;
    const i = randInt(rng, 0, 7);
    const j = randInt(rng, 0, 7);
    const key = `${i},${j}`;
    if (parkKeys.has(key)) continue;
    // Keep the blocks around the spawn intersection built-up, not park.
    if (i === 3 && j === 3) continue;
    parkKeys.add(key);
    parks.push({
      x: vertical[i] + halfRoad + 8,
      y: horizontal[j] + halfRoad + 8,
      w: BLOCK - 16,
      h: BLOCK - 16,
    });
  }

  const buildings = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      if (parkKeys.has(`${i},${j}`)) continue;
      const bx = vertical[i] + halfRoad;
      const by = horizontal[j] + halfRoad;
      // 2x2 lots per block; some lots stay empty as yards.
      for (let lx = 0; lx < 2; lx += 1) {
        for (let ly = 0; ly < 2; ly += 1) {
          if (rng() < 0.24) continue;
          const lot = BLOCK / 2;
          const w = randRange(rng, 62, lot - 26);
          const h = randRange(rng, 62, lot - 26);
          const x = bx + lx * lot + randRange(rng, 10, lot - 10 - w);
          const y = by + ly * lot + randRange(rng, 10, lot - 10 - h);
          buildings.push({
            x,
            y,
            w,
            h,
            hgt: randInt(rng, 20, 90),
            color: pick(rng, BUILDING_COLORS),
            roof: pick(rng, ROOF_COLORS),
          });
        }
      }
    }
  }

  return {
    size: WORLD_SIZE,
    seed,
    buildings,
    parks,
    water: { x: 0, y: 2960, w: WORLD_SIZE, h: WORLD_SIZE - 2960 },
    roads: { vertical, horizontal },
    roadW: ROAD_W,
    spawn: { x: vertical[4], y: horizontal[3] + 176 },
  };
}

export function isRoadAt(city, x, y) {
  const half = city.roadW / 2;
  for (const vx of city.roads.vertical) {
    if (Math.abs(x - vx) <= half) return true;
  }
  for (const hy of city.roads.horizontal) {
    if (Math.abs(y - hy) <= half) return true;
  }
  return false;
}

// True on the beach sea strip (south edge). The coastal road at y=2992 runs
// along the sand, so road points there are still drivable — water is scenery
// and a boundary, not a road.
export function isWaterAt(city, x, y) {
  return y >= city.water.y && x >= city.water.x && x <= city.water.x + city.water.w;
}

// Block indices (0..7, 0..7) for a point, or null when the point is on a road
// or outside the city.
export function blockAt(city, x, y) {
  if (isRoadAt(city, x, y)) return null;
  const half = city.roadW / 2;
  let bi = -1;
  let bj = -1;
  for (let i = 0; i < 8; i += 1) {
    if (x > city.roads.vertical[i] + half && x < city.roads.vertical[i + 1] - half) bi = i;
    if (y > city.roads.horizontal[i] + half && y < city.roads.horizontal[i + 1] - half) bj = i;
  }
  if (bi < 0 || bj < 0) return null;
  return { i: bi, j: bj };
}

export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

export function randomRoadPoint(city, rng) {
  const vertical = rng() < 0.5;
  const lines = vertical ? city.roads.vertical : city.roads.horizontal;
  const line = pick(rng, lines);
  const along = randRange(rng, 90, city.size - 90);
  const off = randRange(rng, -26, 26);
  return vertical ? { x: line + off, y: along } : { x: along, y: line + off };
}

export function randomSidewalkPoint(city, rng) {
  const vertical = rng() < 0.5;
  const lines = vertical ? city.roads.vertical : city.roads.horizontal;
  // Pick a mid-block segment between two neighbouring cross-streets, so the
  // point sits on a straight sidewalk and never on a crossing.
  const cross = vertical ? city.roads.horizontal : city.roads.vertical;
  const seg = randInt(rng, 0, 7);
  const along = randRange(rng, cross[seg] + 70, cross[seg + 1] - 70);
  const line = pick(rng, lines);
  const side = rng() < 0.5 ? -1 : 1;
  // Rendered sidewalk band is roadW/2 .. roadW/2+8; buildings start at
  // roadW/2+10, so a +4..+8 offset keeps the point on the pavement and
  // never inside a building.
  const off = side * (city.roadW / 2 + randRange(rng, 4, 8));
  const p = vertical ? { x: line + off, y: along } : { x: along, y: line + off };
  p.x = Math.max(8, Math.min(city.size - 8, p.x));
  p.y = Math.max(8, Math.min(city.size - 8, p.y));
  return p;
}

function nearestLine(lines, v) {
  let best = lines[0];
  for (const l of lines) {
    if (Math.abs(v - l) < Math.abs(v - best)) best = l;
  }
  return best;
}

export function nearestRoadPoint(city, x, y) {
  const vx = nearestLine(city.roads.vertical, x);
  const hy = nearestLine(city.roads.horizontal, y);
  const cx = Math.max(0, Math.min(city.size, x));
  const cy = Math.max(0, Math.min(city.size, y));
  if (Math.abs(x - vx) <= Math.abs(y - hy)) return { x: vx, y: cy };
  return { x: cx, y: hy };
}
