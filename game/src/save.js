// save.js — localStorage save/load for SOLMAR (key 'solmar-save-v1').
// Used by main.js for the Continue menu option and auto-save on mission end.
// All functions are safe no-ops (false / null) where localStorage is unavailable.
// Wanted level and heat are part of the save: applySave() in main.js restores
// `wanted`, so a Continue no longer drops the player back to zero stars.
const KEY = 'solmar-save-v1';

export function saveGame(game) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const data = {
      money: game.money ?? 250,
      respect: game.respect ?? 0,
      time: game.time || 0,
      // Wanted state: stars survive a reload, and heat (0-100) is stored
      // alongside so a future loader can resume the exact heat level too.
      // (applySave already restores `wanted`; `heat` rebuilds in play.)
      wanted: game.wanted ?? 0,
      heat: game.heat ?? 0,
      missions: {
        done: [...(game.missions?.done || [])],
        index: game.missions?.index ?? 0,
      },
      player: {
        x: game.player?.x ?? 1584,
        y: game.player?.y ?? 1584,
        health: game.player?.health ?? 100,
        weapon: game.player?.weapon ?? 'fists',
        ammo: game.player?.ammo ?? 0,
      },
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) !== null;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
}
