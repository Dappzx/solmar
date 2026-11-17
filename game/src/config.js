// SOLMAR — shared tuning & palette.
// Original fiction: the sun-soaked coastal city of Solmar. No real-world brands,
// no borrowed IP. All art is procedural canvas shapes; all audio is WebAudio.
export const WORLD_SIZE = 3200;
export const ROAD_W = 96;
export const ROAD_GAP = 352;
export const BLOCK = 256;

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-save-v1';

export const COLORS = {
  ground: '#a89a7d',
  groundDark: '#9a8c6f',
  asphalt: '#3a3f4a',
  asphaltDark: '#31353f',
  sidewalk: '#b8a88f',
  curb: '#8f7f66',
  roadLine: '#e8c33a',
  park: '#5d9b52',
  parkDark: '#4c8344',
  water: '#3d8fb8',
  waterDeep: '#2f7396',
  sand: '#e3cf9e',
  buildingEdge: 'rgba(0,0,0,0.35)',
  shadow: 'rgba(0,0,0,0.28)',
};

// Sun-soaked pastel rooftops: terracotta, cream, teal, coral and friends.
export const BUILDING_COLORS = [
  '#d98a6b', // terracotta
  '#e8d9b0', // cream
  '#6fae9e', // teal
  '#e0785a', // coral
  '#c9a86a', // sand gold
  '#8fa8b8', // dusty blue
  '#d9a7b8', // faded rose
  '#9db38a', // sage
];

export const ROOF_COLORS = [
  '#b96f52',
  '#cbb987',
  '#578f81',
  '#c05f45',
  '#a98a52',
  '#748e9e',
  '#bd8a9c',
  '#7f9468',
];

export const PLAYER = {
  radius: 14,
  walkSpeed: 175,
  runSpeed: 295,
  accel: 1500,
  turnSpeed: 7.5,
  maxHealth: 100,
};

export const CAR_DEFAULTS = {
  width: 46,
  height: 22,
  accel: 320,
  maxSpeed: 430,
  reverseSpeed: 160,
  handling: 2.6,
  brake: 520,
};

export const CAR_COLORS = [
  '#c94f3d',
  '#3d6fc9',
  '#e8c33a',
  '#7a4a9e',
  '#3a3f4a',
  '#d8d8d8',
  '#3f9e57',
  '#e0785a',
];

export const GAME = {
  startMoney: 250,
  startHealth: 100,
};
