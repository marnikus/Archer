// Procedural audio: all SFX and the calm music loop are synthesized with the Web Audio API.

type OscType = OscillatorType;

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz

export class AudioSys {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  muted = false;
  private creakOsc: OscillatorNode | null = null;
  private creakGain: GainNode | null = null;
  private creakFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  // music
  private musicOn = false;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  layers = 0;
  private ducked = false;
  private lastStep = -1;

  constructor() {
    try {
      this.muted = localStorage.getItem('als-muted') === '1';
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    // noise buffer
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('als-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.8, this.ctx.currentTime + 0.1);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscType = 'sine',
    vol = 0.2,
    opts: { attack?: number; slideTo?: number; delay?: number; dest?: AudioNode } = {},
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(opts.dest ?? this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2, opts: { type?: BiquadFilterType; freq?: number; freqTo?: number; q?: number; delay?: number } = {}) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t0);
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ----- SFX -----
  footstep(alt: boolean) {
    this.noise(0.09, 0.08, { type: 'lowpass', freq: alt ? 700 : 560, q: 0.8 });
  }
  pop() {
    this.tone(520, 0.12, 'sine', 0.25, { slideTo: 1040 });
    this.noise(0.05, 0.08, { freq: 2500 });
  }
  pickup() {
    this.tone(660, 0.14, 'triangle', 0.22);
    this.tone(990, 0.22, 'triangle', 0.22, { delay: 0.09 });
    this.tone(1320, 0.3, 'sine', 0.15, { delay: 0.18 });
  }
  armed() {
    const seq = [72, 76, 79, 84, 88];
    seq.forEach((n, i) => this.tone(NOTE(n), 0.35, 'triangle', 0.18, { delay: i * 0.1 }));
    this.tone(NOTE(96), 0.6, 'sine', 0.1, { delay: 0.5 });
  }
  shake() {
    this.tone(220, 0.12, 'square', 0.05, { slideTo: 180 });
    this.tone(200, 0.12, 'square', 0.05, { slideTo: 160, delay: 0.14 });
  }
  creakStart() {
    if (!this.ctx || !this.sfxGain) return;
    this.creakStop();
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 70;
    f.type = 'lowpass';
    f.frequency.value = 300;
    f.Q.value = 6;
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.045, this.ctx.currentTime + 0.1);
    o.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    o.start();
    this.creakOsc = o;
    this.creakGain = g;
    this.creakFilter = f;
  }
  creakLevel(p: number) {
    if (!this.ctx || !this.creakOsc || !this.creakFilter) return;
    const t = this.ctx.currentTime;
    this.creakOsc.frequency.setTargetAtTime(60 + p * 90, t, 0.05);
    this.creakFilter.frequency.setTargetAtTime(250 + p * 900, t, 0.05);
  }
  creakStop() {
    if (!this.ctx || !this.creakOsc || !this.creakGain) return;
    const t = this.ctx.currentTime;
    this.creakGain.gain.cancelScheduledValues(t);
    this.creakGain.gain.setTargetAtTime(0.0001, t, 0.03);
    this.creakOsc.stop(t + 0.2);
    this.creakOsc = null;
    this.creakGain = null;
    this.creakFilter = null;
  }
  twang(power: number) {
    this.tone(160 + power * 60, 0.35, 'triangle', 0.3, { slideTo: 110 });
    this.tone(640, 0.08, 'square', 0.06, { slideTo: 300 });
    this.noise(0.06, 0.15, { freq: 1800, q: 0.7 });
  }
  whoosh() {
    this.noise(0.55, 0.22, { freq: 500, freqTo: 1800, q: 1.2, delay: 0.03 });
  }
  thud() {
    this.tone(150, 0.22, 'sine', 0.45, { slideTo: 55 });
    this.noise(0.15, 0.3, { type: 'lowpass', freq: 500, q: 0.7 });
  }
  groundThud() {
    this.tone(120, 0.16, 'sine', 0.25, { slideTo: 50 });
    this.noise(0.12, 0.14, { type: 'lowpass', freq: 400 });
  }
  wallThud() {
    this.tone(220, 0.12, 'triangle', 0.2, { slideTo: 90 });
    this.noise(0.1, 0.18, { freq: 900 });
  }
  chime() {
    [1319, 1760, 2093, 2637].forEach((f, i) => this.tone(f, 0.9, 'sine', 0.16, { delay: i * 0.07 }));
  }
  score(zone: number) {
    const base = [72, 76, 79, 84][Math.min(3, zone)];
    this.tone(NOTE(base), 0.25, 'triangle', 0.16, { delay: 0.08 });
    this.tone(NOTE(base + 4), 0.35, 'triangle', 0.14, { delay: 0.18 });
  }
  womp() {
    this.tone(280, 0.45, 'sine', 0.22, { slideTo: 120 });
    this.tone(140, 0.5, 'triangle', 0.1, { slideTo: 70, delay: 0.05 });
  }
  closeCall() {
    this.tone(880, 0.12, 'sine', 0.1, { slideTo: 660 });
  }
  streak() {
    [76, 80, 83, 88].forEach((n, i) => this.tone(NOTE(n), 0.3, 'triangle', 0.18, { delay: i * 0.08 }));
  }
  fanfare() {
    const seq: Array<[number, number]> = [
      [72, 0],
      [76, 0.12],
      [79, 0.24],
      [84, 0.36],
      [83, 0.6],
      [84, 0.72],
      [88, 0.9],
    ];
    for (const [n, d] of seq) {
      this.tone(NOTE(n), 0.5, 'triangle', 0.22, { delay: d });
      this.tone(NOTE(n - 12), 0.5, 'sine', 0.12, { delay: d });
    }
    this.tone(NOTE(96), 1.4, 'sine', 0.12, { delay: 1.05 });
  }
  uiClick() {
    this.tone(900, 0.06, 'sine', 0.08, { slideTo: 1200 });
  }
  gameOver() {
    [64, 60, 55].forEach((n, i) => this.tone(NOTE(n), 0.6, 'triangle', 0.16, { delay: i * 0.25 }));
  }

  // ----- MUSIC (generative, layered) -----
  musicStart() {
    if (!this.ctx) return;
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }
  musicStop() {
    this.musicOn = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  setLayers(n: number) {
    this.layers = Math.max(0, Math.min(3, n));
  }
  duck(on: boolean) {
    if (this.ducked === on || !this.ctx || !this.musicGain) return;
    this.ducked = on;
    this.musicGain.gain.setTargetAtTime(on ? 0.18 : 0.55, this.ctx.currentTime, 0.25);
  }
  private schedule() {
    if (!this.ctx || !this.musicOn) return;
    const stepDur = 60 / 92 / 2;
    while (this.nextTime < this.ctx.currentTime + 0.35) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  }
  private mnote(n: number, t: number, dur: number, type: OscType, vol: number) {
    if (!this.ctx || !this.musicGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    o.type = type;
    o.frequency.value = NOTE(n);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private playStep(i: number, t: number) {
    if (!this.ctx) return;
    if (i === this.lastStep) return;
    this.lastStep = i;
    // 4-bar progression (8 steps per bar): C  Am  F  G
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ];
    const bar = Math.floor(i / 8) % 4;
    const chord = chords[bar];
    const s = i % 8;
    // pad on bar start
    if (s === 0) {
      for (const n of chord) this.mnote(n, t, 2.4, 'triangle', 0.035);
    }
    // gentle arpeggio
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    if (s % 2 === 0 || Math.random() < 0.4) {
      this.mnote(chord[arp[s]] + 12, t, 0.5, 'sine', 0.06);
    }
    if (this.layers >= 1 && s % 4 === 0) {
      this.mnote(chord[0] - 24, t, 1.1, 'triangle', 0.07);
    }
    if (this.layers >= 2 && s % 2 === 1 && Math.random() < 0.6) {
      const pent = [0, 2, 4, 7, 9];
      const n = 72 + pent[Math.floor(Math.random() * pent.length)] + (bar === 2 ? -1 : 0);
      this.mnote(n + 12, t, 0.35, 'sine', 0.035);
    }
    if (this.layers >= 3 && s % 2 === 1 && this.noiseBuf && this.musicGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.1);
    }
  }
}
