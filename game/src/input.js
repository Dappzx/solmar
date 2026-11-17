// Keyboard + mouse input. Keys are stored by e.code ('KeyW', 'Space', ...);
// `pressed` holds edge-triggered presses (cleared once per frame by main.js).
// mouse.wx/wy are world-space coordinates, filled in by main.js each frame
// from the camera (createInput only knows the canvas).
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0 },
    clearPressed() {
      input.pressed.clear();
    },
    // Edge-triggered check that consumes the press, so two systems cannot
    // both react to the same keypress in one frame.
    wasPressed(code) {
      if (!input.pressed.has(code)) return false;
      input.pressed.delete(code);
      return true;
    },
  };

  const GAME_KEYS = [
    'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyC',
    'ShiftLeft', 'ShiftRight', 'Escape', 'Enter',
  ];

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  // A lost window focus must never leave a key stuck down.
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouse.down = false;
  });

  function updateMousePos(e) {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    input.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  }

  canvas.addEventListener('mousemove', updateMousePos);
  canvas.addEventListener('mousedown', (e) => {
    updateMousePos(e);
    input.mouse.down = true;
    input.pressed.add('MouseLeft');
  });
  window.addEventListener('mouseup', () => {
    input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return input;
}
