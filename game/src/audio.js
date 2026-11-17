// audio.js — WebAudio synth for SOLMAR. No audio files, everything synthesised.
// The AudioContext is created lazily on the first user gesture (call resume()
// from a click/key handler); all methods are safe no-ops without audio support.
export function createAudio() {
  let ac = null;
  let master = null;
  let musicTimer = null;
  let musicOn = false;
  let step = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = null;

  function hasAudio() {
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }
  function ensure() {
    if (ac) return true;
    if (!hasAudio()) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.4;
      master.connect(ac.destination);
      return true;
    } catch (e) {
      return false;
    }
  }
  function resume() {
    if (ensure() && ac.state === 'suspended') ac.resume().catch(() => {});
  }
  // Short enveloped oscillator blip.
  function tone(freq, dur, opts = {}) {
    if (!ensure() || !master) return;
    const { type = 'square', vol = 0.2, slideTo = null, delay = 0 } = opts;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // Filtered noise burst (shots, crashes).
  function noise(dur, opts = {}) {
    if (!ensure() || !master) return;
    const { vol = 0.3, low = 1200, delay = 0 } = opts;
    const t = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = low;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // Simple 16-step loop: A-minor bassline + hat tick + kick thump.
  const BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 82.41, 0, 73.42, 0];
  function musicTick() {
    if (!musicOn || !ac || ac.state !== 'running') return;
    const s = step % 16;
    const b = BASS[s];
    if (b) tone(b, 0.22, { type: 'triangle', vol: 0.5 });
    if (s % 2 === 0) tone(6000, 0.03, { type: 'square', vol: 0.04 });
    if (s % 4 === 2) tone(170, 0.09, { type: 'sine', vol: 0.3 });
    step += 1;
  }
  function setMusic(on) {
    musicOn = !!on;
    if (musicOn) {
      resume();
      if (!musicTimer) musicTimer = setInterval(musicTick, 140);
    } else if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    resume,
    get musicOn() { return musicOn; },
    setMusic,
    toggleMusic() { setMusic(!musicOn); return musicOn; },

    // Continuous engine hum; call every frame with speed 0..1.
    engine(speed01) {
      if (!ensure() || !master) return;
      const s = Math.max(0, Math.min(1, speed01 || 0));
      if (!engineOsc) {
        engineOsc = ac.createOscillator();
        engineOsc.type = 'sawtooth';
        const filt = ac.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 900;
        engineGain = ac.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(filt);
        filt.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t = ac.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + s * 170, t, 0.05);
      engineGain.gain.setTargetAtTime(s < 0.02 ? 0 : 0.04 + s * 0.07, t, 0.1);
    },

    // Police siren on/off (alternating two-tone).
    siren(on) {
      if (on) {
        if (!ensure()) return;
        resume();
        if (sirenTimer) return;
        let hi = false;
        sirenTimer = setInterval(() => {
          hi = !hi;
          tone(hi ? 950 : 700, 0.28, { type: 'sine', vol: 0.11 });
        }, 300);
      } else if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
    },

    shot() {
      noise(0.12, { vol: 0.5, low: 3200 });
      tone(170, 0.1, { type: 'square', vol: 0.25, slideTo: 60 });
    },
    pickup() {
      tone(660, 0.09, { type: 'sine', vol: 0.25 });
      tone(990, 0.14, { type: 'sine', vol: 0.25, delay: 0.08 });
    },
    crash() {
      noise(0.35, { vol: 0.5, low: 800 });
      tone(90, 0.3, { type: 'sawtooth', vol: 0.2, slideTo: 40 });
    },
    missionOk() {
      [523, 659, 784, 1047].forEach((f, i) => {
        tone(f, 0.16, { type: 'triangle', vol: 0.25, delay: i * 0.09 });
      });
    },
    click() {
      tone(1200, 0.04, { type: 'square', vol: 0.12 });
    },
    // Generic dispatcher for other modules' sfx(game, name) calls.
    // Unknown names are ignored; never throws.
    play(name) {
      const map = {
        shoot: 'shot', shot: 'shot', crash: 'crash', pickup: 'pickup',
        steal: 'pickup', door: 'click', click: 'click', swing: 'click',
        punch: 'crash', thud: 'crash', missionOk: 'missionOk',
      };
      const m = map[name];
      if (!m) return;
      if (m === 'shot') this.shot();
      else if (m === 'crash') this.crash();
      else if (m === 'pickup') this.pickup();
      else if (m === 'click') this.click();
      else if (m === 'missionOk') this.missionOk();
    },
    // Stop all loops/timers (call on teardown; the context itself is reused).
    destroy() {
      setMusic(false);
      if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
      if (engineGain) engineGain.gain.setTargetAtTime(0, ac ? ac.currentTime : 0, 0.05);
    },
  };
}
