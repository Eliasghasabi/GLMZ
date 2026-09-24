// ─────────────────────────────────────────────────────────────
//  Audio engine — 100% procedural WebAudio synthesis.
//  No external assets: every gunshot, reload click, footstep and
//  ambient sound is generated from oscillators + filtered noise.
//  Swap any function for a sample player to hook in real audio.
// ─────────────────────────────────────────────────────────────

import type { Settings } from "./settings";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambient!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private ambientOn = false;
  private stepFlip = false;

  /** Must be called from a user gesture. Idempotent. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.ambient = this.ctx.createGain();
      this.ambient.connect(this.master);

      // shared 1.2s white-noise buffer
      const len = Math.floor(this.ctx.sampleRate * 1.2);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  applySettings(s: Settings) {
    if (!this.ctx) return;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ── primitives ────────────────────────────────────────────

  private amp(vol: number, dest?: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = vol;
    g.connect(dest || this.sfx);
    return g;
  }

  private filter(
    type: BiquadFilterType,
    freq: number,
    q = 1,
    dest?: AudioNode
  ): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest || this.sfx);
    return f;
  }

  /** filtered noise burst */
  private noise(
    t0: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    vol: number,
    q = 1,
    dest?: AudioNode,
    freqEnd?: number
  ) {
    if (!this.ctx || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.filter(type, freq, q, dest);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = this.amp(0, f);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** oscillator blip with pitch + volume envelope */
  private tone(
    t0: number,
    dur: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    vol: number,
    dest?: AudioNode
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.amp(0, dest);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // ── weapon sounds ─────────────────────────────────────────

  shot(kind: string) {
    if (!this.ctx) return;
    const t = this.t;
    if (kind === "assault") {
      this.noise(t, 0.13, "lowpass", 3200, 0.55, 1, undefined, 500);
      this.noise(t, 0.035, "highpass", 2500, 0.4);
      this.tone(t, 0.09, "sine", 150, 55, 0.5);
      this.tone(t, 0.03, "square", 1200, 700, 0.12);
    } else if (kind === "shotgun") {
      this.noise(t, 0.28, "lowpass", 1800, 0.9, 1, undefined, 300);
      this.tone(t, 0.22, "sine", 130, 42, 0.85);
      this.noise(t, 0.05, "highpass", 1800, 0.35);
    } else if (kind === "longbow") {
      // anti-materiel: enormous crack, deep body, long rolling echo
      this.noise(t, 0.06, "highpass", 3600, 0.7);
      this.noise(t, 0.72, "lowpass", 1200, 1.0, 1, undefined, 150);
      this.tone(t, 0.42, "sine", 130, 30, 1.0);
      this.tone(t, 0.1, "square", 420, 130, 0.22);
      this.noise(t + 0.2, 0.7, "lowpass", 420, 0.4);
      this.noise(t + 0.52, 0.8, "lowpass", 260, 0.24);
    } else if (kind === "vector") {
      // DMR: tight, bright, fast decay — built for follow-up shots
      this.noise(t, 0.035, "highpass", 4200, 0.42);
      this.noise(t, 0.17, "lowpass", 2600, 0.5, 1, undefined, 700);
      this.tone(t, 0.1, "sine", 210, 78, 0.44);
      this.tone(t, 0.03, "square", 1500, 900, 0.1);
      this.noise(t + 0.07, 0.2, "lowpass", 900, 0.14);
    } else if (kind === "obsidian") {
      // integrally suppressed: a muted thump plus mechanical action clack
      this.noise(t, 0.1, "lowpass", 760, 0.4, 1, undefined, 220);
      this.tone(t, 0.13, "sine", 155, 62, 0.32);
      this.tone(t + 0.012, 0.05, "square", 780, 420, 0.09);   // bolt clack
      this.noise(t + 0.012, 0.06, "bandpass", 1900, 0.13, 3);
    } else if (kind === "sniper") {
      this.noise(t, 0.05, "highpass", 3000, 0.5);
      this.noise(t, 0.5, "lowpass", 1400, 1.0, 1, undefined, 220);
      this.tone(t, 0.3, "sine", 160, 40, 0.8);
      // distant echo tail
      this.noise(t + 0.16, 0.45, "lowpass", 500, 0.3);
    }
  }

  /** short cinematic sting layered under the kill flourish */
  killConfirm(kind: string) {
    if (!this.ctx) return;
    const t = this.t;
    if (kind === "longbow") {
      // heavy mechanical bolt cycle: rip, eject, slam
      this.noise(t + 0.02, 0.1, "bandpass", 900, 0.2, 2);
      this.tone(t + 0.02, 0.07, "square", 520, 250, 0.13);
      this.tone(t + 0.2, 0.05, "triangle", 1500, 1500, 0.1);   // case ping
      this.tone(t + 0.26, 0.06, "triangle", 2100, 1900, 0.07);
      this.noise(t + 0.34, 0.12, "bandpass", 620, 0.26, 2);    // slam home
      this.tone(t + 0.34, 0.1, "sine", 150, 68, 0.3);
    } else if (kind === "vector") {
      // digital confirm chirp + charging handle snap
      this.tone(t, 0.05, "square", 1400, 1400, 0.1);
      this.tone(t + 0.05, 0.07, "square", 2100, 2100, 0.11);
      this.noise(t + 0.02, 0.07, "bandpass", 2400, 0.14, 3);
      this.tone(t + 0.14, 0.05, "sine", 2800, 2400, 0.07);
    } else {
      // obsidian: rising charge whine as the rails pulse
      const f = this.filter("bandpass", 1400, 1.2);
      this.tone(t, 0.34, "sawtooth", 320, 1250, 0.12, f);
      this.tone(t + 0.05, 0.3, "sine", 640, 1900, 0.08);
      this.noise(t + 0.02, 0.16, "bandpass", 1700, 0.1, 3);
      this.tone(t + 0.3, 0.1, "sine", 2300, 2300, 0.06);
    }
  }

  sniperBolt() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t + 0.02, 0.05, "square", 900, 500, 0.1);
    this.noise(t + 0.02, 0.06, "bandpass", 1600, 0.15, 2);
    this.tone(t + 0.16, 0.05, "square", 700, 400, 0.1);
    this.noise(t + 0.16, 0.06, "bandpass", 1200, 0.15, 2);
  }

  dryFire() {
    if (!this.ctx) return;
    this.tone(this.t, 0.04, "square", 1100, 600, 0.12);
  }

  reloadStage(stage: 0 | 1 | 2) {
    if (!this.ctx) return;
    const t = this.t;
    if (stage === 0) {
      this.tone(t, 0.05, "square", 620, 380, 0.14);
      this.noise(t, 0.07, "bandpass", 900, 0.16, 2);
    } else if (stage === 1) {
      this.noise(t, 0.1, "bandpass", 600, 0.18, 2);
      this.tone(t + 0.03, 0.05, "square", 480, 300, 0.12);
    } else {
      this.tone(t, 0.04, "square", 950, 620, 0.16);
      this.noise(t, 0.06, "highpass", 1400, 0.2);
    }
  }

  weaponSwitch() {
    if (!this.ctx) return;
    const t = this.t;
    this.noise(t, 0.16, "bandpass", 500, 0.14, 1.5, undefined, 1700);
    this.tone(t + 0.13, 0.04, "square", 800, 500, 0.1);
  }

  // ── combat feedback ───────────────────────────────────────

  enemyShot(dist: number) {
    if (!this.ctx) return;
    const t = this.t;
    const att = 1 / (1 + dist * 0.12);
    const lp = Math.max(300, 6000 / (1 + dist * 0.09));
    this.noise(t, 0.12, "lowpass", lp, 0.4 * att, 1, undefined, lp * 0.3);
    this.tone(t, 0.08, "sine", 140, 60, 0.35 * att);
  }

  hit(headshot: boolean) {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.035, "sine", headshot ? 2500 : 1900, 1300, 0.22);
    if (headshot) this.tone(t + 0.03, 0.04, "sine", 3100, 2100, 0.18);
  }

  kill() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.06, "sine", 1500, 900, 0.25);
    this.tone(t + 0.06, 0.09, "sine", 900, 420, 0.22);
  }

  enemyDie() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.28, "sawtooth", 260, 60, 0.18);
    this.noise(t, 0.2, "lowpass", 500, 0.2);
  }

  playerHurt() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.16, "sine", 110, 55, 0.55);
    this.noise(t, 0.12, "lowpass", 600, 0.3);
  }

  playerDie() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.9, "sawtooth", 220, 40, 0.3);
    this.noise(t, 0.8, "lowpass", 400, 0.35);
  }

  // ── movement ──────────────────────────────────────────────

  footstep() {
    if (!this.ctx) return;
    this.stepFlip = !this.stepFlip;
    const f = this.stepFlip ? 320 : 260;
    this.noise(this.t, 0.07, "bandpass", f, 0.12, 1.4);
  }

  jump() {
    if (!this.ctx) return;
    this.noise(this.t, 0.09, "bandpass", 500, 0.08, 1.4);
  }

  land() {
    if (!this.ctx) return;
    this.noise(this.t, 0.1, "lowpass", 380, 0.2);
    this.tone(this.t, 0.08, "sine", 90, 50, 0.2);
  }

  // ── pickups / waves / UI ──────────────────────────────────

  pickup() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.07, "sine", 620, 620, 0.2);
    this.tone(t + 0.07, 0.09, "sine", 930, 930, 0.2);
  }

  waveStart() {
    if (!this.ctx) return;
    const t = this.t;
    const f = this.filter("bandpass", 480, 0.8);
    this.tone(t, 0.7, "sawtooth", 110, 108, 0.22, f);
    this.tone(t, 0.7, "sawtooth", 165, 161, 0.18, f);
    this.tone(t + 0.05, 0.55, "sine", 55, 55, 0.35);
    this.noise(t, 0.5, "lowpass", 300, 0.2);
  }

  waveComplete() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 0.14, "triangle", 440, 440, 0.22);
    this.tone(t + 0.14, 0.14, "triangle", 554, 554, 0.22);
    this.tone(t + 0.28, 0.3, "triangle", 659, 659, 0.24);
  }

  uiClick() {
    if (!this.ctx) return;
    this.tone(this.t, 0.045, "square", 840, 560, 0.1);
  }

  uiHover() {
    if (!this.ctx) return;
    this.tone(this.t, 0.025, "sine", 1250, 1100, 0.045);
  }

  // ── ambient bed ───────────────────────────────────────────

  startAmbient() {
    if (!this.ctx || this.ambientOn || !this.noiseBuf) return;
    this.ambientOn = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 160;
    const g = this.ctx.createGain();
    g.gain.value = 0.1;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.ambient);
    src.start();
    lfo.start();
    this.ambient.gain.value = 0.65;
    this.scheduleRumble();
  }

  private scheduleRumble() {
    if (!this.ctx || !this.ambientOn) return;
    const delay = 7000 + Math.random() * 9000;
    window.setTimeout(() => {
      if (this.ctx && this.ambientOn) {
        const t = this.t;
        this.noise(t, 2.2, "lowpass", 90, 0.4, 1, this.ambient);
        this.tone(t, 1.8, "sine", 48, 36, 0.25, this.ambient);
      }
      this.scheduleRumble();
    }, delay);
  }
}

export const audio = new AudioEngine();
