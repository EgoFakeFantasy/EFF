"use strict";

// Procedural themes and one-shot effects. Everything is synthesised with Web
// Audio inside the existing soundscape, so it stays off until the player
// turns the soundscape on. Notes are scheduled a little ahead from the
// render loop; no timers survive a pause, reset or a closed tab.
const Music = {
  theme: null,
  step: 0,
  nextTime: 0,
  notes: 0,
  bus: null,
  // step: seconds per step; scale: MIDI notes; density: chance a step sounds;
  // pattern: optional fixed index order; voice: oscillator and envelope.
  themes: {
    mirror: { step: 0.42, scale: [69, 72, 74, 76, 79, 81, 84], density: 0.45, voice: { type: "triangle", decay: 1.6, gain: 0.05 }, bass: { every: 8, note: 45 } },
    storm: { step: 0.3, scale: [57, 60, 62, 64, 67, 69, 72, 74], pattern: [0, 1, 2, 3, 4, 5, 6, 7], density: 0.85, voice: { type: "sine", decay: 0.7, gain: 0.04 } },
    void: { step: 0.5, scale: [62, 64, 65, 67, 69, 71, 72, 74], density: 0.55, voice: { type: "triangle", decay: 1.2, gain: 0.045 }, bass: { every: 16, note: 38 } },
    emptyHome: { step: 0.7, scale: [60, 61, 66, 67, 72], density: 0.25, voice: { type: "sine", decay: 2.2, gain: 0.05 } },
    home: { step: 0.45, scale: [60, 62, 64, 67, 69, 72], density: 0.6, voice: { type: "triangle", decay: 1, gain: 0.04 }, chords: { every: 8, roots: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]] } },
    horror: { step: 0.5, heartbeat: true, stab: { every: 16, notes: [50, 56] } },
    rain: { step: 0.4, scale: [57, 60, 64, 67, 69, 72], pattern: [0, 2, 4, 2, 1, 3, 5, 3], density: 0.9, voice: { type: "sine", decay: 1.4, gain: 0.04 } },
    meta: { step: 0.55, scale: [60, 67, 74, 81, 64, 71, 78], density: 0.5, voice: { type: "triangle", decay: 2, gain: 0.04 } },
    true: { step: 0.5, scale: [60, 64, 67, 72, 76, 79], pattern: [0, 2, 4, 5, 3, 1, 2, 4], density: 0.8, voice: { type: "triangle", decay: 1.6, gain: 0.045 }, chords: { every: 8, roots: [[48, 55, 64], [53, 57, 64], [55, 59, 62], [48, 55, 64]] } },
    bad: { step: 0.9, scale: [45, 46, 52], density: 0.4, voice: { type: "sine", decay: 2.5, gain: 0.05 } },
  },

  freq(midi) { return 440 * 2 ** ((midi - 69) / 12); },
  enabled() { return AudioEngine.enabled && !!AudioEngine.ctx && Expedition.prefs.music !== false && !document.hidden; },

  setTheme(name) {
    if (!this.themes[name] || this.theme === name) return;
    this.theme = name;
    this.step = 0;
    this.nextTime = 0;
  },

  // A shared bus with a soft echo gives every voice the same room.
  ensureBus() {
    const c = AudioEngine.ctx;
    if (this.bus?.ctx === c) return this.bus;
    // Loud enough to sit above the rain and storm noise beds, well below clipping.
    const input = c.createGain(); input.gain.value = 2;
    input.connect(AudioEngine.master);
    if (typeof c.createDelay === "function") {
      const delay = c.createDelay(1), feedback = c.createGain(), wet = c.createGain();
      if (delay.delayTime) delay.delayTime.value = 0.38;
      feedback.gain.value = 0.3; wet.gain.value = 0.28;
      input.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(AudioEngine.master);
    }
    this.bus = { ctx: c, input };
    return this.bus;
  },

  tone(midi, at, { type = "sine", decay = 1, gain = 0.04, attack = 0.008, glide = 0 } = {}) {
    const c = AudioEngine.ctx, bus = this.ensureBus();
    const osc = c.createOscillator(), env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(this.freq(midi), at);
    if (glide) osc.frequency.exponentialRampToValueAtTime(this.freq(midi + glide), at + decay * 0.6);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env); env.connect(bus.input);
    osc.start(at); osc.stop(at + decay + 0.05);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
    this.notes += 1;
  },

  playStep(theme, step, at) {
    const h = k => hash(step, k, theme.step * 1000);
    if (theme.heartbeat) {
      // Two low beats per bar, the second softer: the courtyard's pulse.
      const beat = step % 4;
      if (beat === 0 || beat === 1) this.tone(beat ? 31 : 33, at, { type: "sine", decay: 0.35, gain: beat ? 0.07 : 0.1, glide: -5 });
      if (theme.stab && step % theme.stab.every === 8) for (const n of theme.stab.notes) this.tone(n, at, { type: "sawtooth", decay: 1.8, gain: 0.012 });
      return;
    }
    if (theme.chords && step % theme.chords.every === 0) {
      const chord = theme.chords.roots[Math.floor(step / theme.chords.every) % theme.chords.roots.length];
      for (const n of chord) this.tone(n, at, { type: "sine", decay: theme.step * theme.chords.every, gain: 0.018, attack: 0.3 });
    }
    if (theme.bass && step % theme.bass.every === 0) this.tone(theme.bass.note, at, { type: "sine", decay: theme.step * theme.bass.every, gain: 0.03, attack: 0.2 });
    if (h(1) > theme.density) return;
    const index = theme.pattern ? theme.pattern[step % theme.pattern.length] : Math.floor(h(2) * theme.scale.length);
    this.tone(theme.scale[index % theme.scale.length], at, theme.voice);
  },

  update() {
    if (!this.enabled() || !this.theme) return;
    const c = AudioEngine.ctx, theme = this.themes[this.theme];
    if (c.state !== "running") return;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    // Each step advances time, so this loop always ends.
    while (this.nextTime < c.currentTime + 0.3) {
      this.playStep(theme, this.step, this.nextTime);
      this.step += 1;
      this.nextTime += theme.step;
    }
  },

  reset() { this.step = 0; this.nextTime = 0; },
};

const Sfx = {
  played: [],

  noise(at, duration, { type = "lowpass", freq = 1200, gain = 0.15, endFreq = 0 } = {}) {
    const c = AudioEngine.ctx;
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), env = c.createGain();
    src.buffer = AudioEngine.noiseBuffer(Math.max(0.1, duration));
    filter.type = type; filter.frequency.setValueAtTime(freq, at);
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, at + duration);
    env.gain.setValueAtTime(gain, at); env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter); filter.connect(env); env.connect(AudioEngine.master);
    src.start(at); src.stop(at + duration + 0.05);
    src.onended = () => { src.disconnect(); filter.disconnect(); env.disconnect(); };
  },

  play(name) {
    if (!AudioEngine.enabled || !AudioEngine.ctx || document.hidden) return false;
    const c = AudioEngine.ctx, now = c.currentTime;
    try {
      if (name === "shatter") {
        this.noise(now, 0.45, { type: "highpass", freq: 3200, gain: 0.22 });
        for (let i = 0; i < 7; i++) Music.tone(88 + Math.floor(hash(i, 3, 61) * 10), now + 0.05 + i * 0.07, { type: "triangle", decay: 0.5, gain: 0.03 });
      } else if (name === "lid") {
        this.noise(now, 0.9, { type: "lowpass", freq: 520, endFreq: 180, gain: 0.12 });
        Music.tone(30, now + 1.0, { type: "sine", decay: 0.4, gain: 0.14, glide: -6 });
      } else if (name === "wake") {
        Music.tone(55, now + 0.15, { type: "sine", decay: 0.7, gain: 0.05, glide: 12 });
      } else if (name === "crack") {
        for (let i = 0; i < 4; i++) this.noise(now + i * 0.13, 0.12, { type: "bandpass", freq: 900 + i * 300, gain: 0.16 });
        Music.tone(28, now, { type: "sine", decay: 1.8, gain: 0.08 });
      } else if (name === "crumble") {
        this.noise(now, 2.2, { type: "lowpass", freq: 900, endFreq: 120, gain: 0.14 });
        for (let i = 0; i < 5; i++) Music.tone(79 + i * 2, now + 0.4 + i * 0.25, { type: "sine", decay: 0.6, gain: 0.02 });
      } else if (name === "shard") {
        [76, 81, 88].forEach((n, i) => Music.tone(n, now + i * 0.08, { type: "triangle", decay: 0.9, gain: 0.05 }));
      } else return false;
    } catch { return false; /* Sound is decoration only. */ }
    this.played.push(name);
    if (this.played.length > 20) this.played.shift();
    return true;
  },
};
