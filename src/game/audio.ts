import type { Surface } from "./world";

export interface AmbientState {
  waterDist: number; // odległość do wody (m), < 0 gdy w wodzie
  forest: boolean;
  underwater: boolean;
  birds: number;
  wind: number;
}

/** Proceduralna ścieżka dźwiękowa: wiatr, fale, ptaki, kroki */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private rustleGain!: GainNode;
  private lapGain!: GainNode;
  private birdTimer = 2;
  private cuckooTimer = 12;
  private gustT = 0;
  private volume = 0.7;
  private muted = false;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 20000;
    this.lowpass.connect(this.master);
    this.master.connect(ctx.destination);

    // bufor szumu
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const wn = Math.random() * 2 - 1;
      // przybliżony szum różowy
      b0 = 0.997 * b0 + wn * 0.0555;
      b1 = 0.985 * b1 + wn * 0.0751;
      b2 = 0.95 * b2 + wn * 0.1538;
      d[i] = (b0 + b1 + b2 + wn * 0.5362) * 0.35;
    }
    const loop = (f: number, type: BiquadFilterType, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.loopStart = Math.random();
      const filt = ctx.createBiquadFilter();
      filt.type = type;
      filt.frequency.value = f;
      filt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(filt);
      filt.connect(g);
      g.connect(this.lowpass);
      src.start();
      return g;
    };
    this.windGain = loop(420, "lowpass", 0.6);
    this.rustleGain = loop(2400, "bandpass", 0.5);
    this.lapGain = loop(650, "bandpass", 0.7);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  update(dt: number, s: AmbientState) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.lowpass.frequency.setTargetAtTime(s.underwater ? 380 : 20000, t, 0.08);
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = 1.5 + Math.random() * 3.5;
      const gust = 0.6 + Math.random() * 0.8;
      this.windGain.gain.setTargetAtTime(0.035 * s.wind * gust * (s.underwater ? 0.1 : 1), t, 1.2);
      this.rustleGain.gain.setTargetAtTime((s.forest ? 0.016 : 0.007) * s.wind * gust * (s.underwater ? 0 : 1), t, 1.0);
    }
    // fale
    const near = s.waterDist < 0 ? 1 : Math.max(0, 1 - s.waterDist / 70);
    const lap = near * near * (0.1 + 0.05 * Math.sin(t * 0.9) + 0.04 * Math.sin(t * 2.3)) * (s.underwater ? 0.3 : 1);
    this.lapGain.gain.setTargetAtTime(Math.max(0, lap), t, 0.3);

    if (s.underwater) return;
    // ptaki
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = (1.2 + Math.random() * 5) / Math.max(0.3, s.birds * (s.forest ? 1.6 : 0.8));
      this.chirp();
    }
    this.cuckooTimer -= dt;
    if (this.cuckooTimer <= 0) {
      this.cuckooTimer = 18 + Math.random() * 30;
      if (s.forest || Math.random() < 0.4) this.cuckoo();
    }
  }

  private tone(freq0: number, freq1: number, dur: number, gain: number, pan: number, delay = 0, type: OscillatorType = "sine") {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(50, freq1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(this.lowpass);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private chirp() {
    const base = 2200 + Math.random() * 3200;
    const pan = Math.random() * 2 - 1;
    const n = 2 + Math.floor(Math.random() * 5);
    const style = Math.random();
    for (let i = 0; i < n; i++) {
      const d = i * (0.08 + Math.random() * 0.06);
      if (style < 0.5) this.tone(base, base * (1.2 + Math.random() * 0.5), 0.07, 0.035 + Math.random() * 0.03, pan, d);
      else this.tone(base * (1 + 0.15 * (i % 2)), base * 0.8, 0.1, 0.03 + Math.random() * 0.02, pan, d);
    }
  }

  private cuckoo() {
    const pan = Math.random() * 1.4 - 0.7;
    this.tone(740, 700, 0.28, 0.07, pan, 0);
    this.tone(590, 560, 0.34, 0.07, pan, 0.38);
    if (Math.random() < 0.7) {
      this.tone(740, 700, 0.28, 0.06, pan, 1.1);
      this.tone(590, 560, 0.34, 0.06, pan, 1.48);
    }
  }

  footstep(surface: Surface, running: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.12, gain = 0.2, f = 900, type: BiquadFilterType = "lowpass", q = 0.6;
    switch (surface) {
      case "grass":
        f = 1100;
        gain = 0.22;
        break;
      case "forest":
        f = 800;
        dur = 0.15;
        gain = 0.24;
        break;
      case "sand":
        f = 2200;
        type = "bandpass";
        q = 0.8;
        dur = 0.15;
        gain = 0.16;
        break;
      case "dirt":
        f = 1500;
        gain = 0.22;
        break;
      case "asphalt":
        f = 1400;
        type = "highpass";
        dur = 0.07;
        gain = 0.1;
        break;
      case "wood":
        f = 380;
        type = "bandpass";
        q = 1.2;
        dur = 0.14;
        gain = 0.32;
        break;
      case "water":
        f = 1800;
        dur = 0.4;
        gain = 0.3;
        break;
    }
    if (running) gain *= 1.3;
    filt.type = type;
    filt.frequency.setValueAtTime(f, t);
    if (surface === "water") filt.frequency.exponentialRampToValueAtTime(350, t + dur);
    filt.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.lowpass);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
    if (surface === "wood") this.tone(95, 60, 0.12, 0.12, 0);
  }

  splash(strength: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(2400, t);
    filt.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35 * strength, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.lowpass);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.9);
  }

  /** świst żyłki przy rzucie */
  cast() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.value = 1.4;
    filt.frequency.setValueAtTime(500, t);
    filt.frequency.exponentialRampToValueAtTime(3200, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.lowpass);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.4);
  }

  /** metaliczne „klik” kabłąka */
  bail() {
    if (!this.ctx) return;
    this.tone(2200, 1100, 0.05, 0.07, 0.1);
    this.tone(1400, 700, 0.07, 0.05, 0.1, 0.045);
  }

  reelClick() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.lowpass);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.05);
  }

  ding() {
    if (!this.ctx) return;
    this.tone(1180, 1170, 0.22, 0.1, 0);
    this.tone(1770, 1760, 0.16, 0.05, 0, 0.01);
  }

  catchJingle() {
    if (!this.ctx) return;
    this.tone(523, 523, 0.16, 0.09, 0, 0);
    this.tone(659, 659, 0.16, 0.09, 0, 0.14);
    this.tone(784, 784, 0.3, 0.1, 0, 0.28);
  }

  dispose() {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
