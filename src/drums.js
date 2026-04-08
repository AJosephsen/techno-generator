/**
 * drums.js — Electronic drum synthesizers for techno / drum n bass
 *
 * Each drum class takes an AudioContext and an optional output AudioNode.
 * All synths are created fresh per-trigger so they're garbage-collected after
 * the note ends. No persistent oscillator state is kept per instance.
 */

export class KickDrum {
  /**
   * 808-style deep bass kick.
   * @param {AudioContext} audioCtx
   * @param {AudioNode}    output   Destination node (default: audioCtx.destination)
   */
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;

    // Voice parameters — tweak externally to reshape the sound
    this.tune  = 40;   // Hz  — sustained bass tone frequency
    this.decay = 0.59; // s   — amplitude envelope length
    this.punch = 3.55; // ×   — start freq = tune × punch  (pitch sweep range)
    this.click = 0.6;  // 0–1 — level of the transient click attack
  }

  trigger(time, velocity = 1) {
    const v = Math.min(velocity, 1);

    // --- Transient click (stick-on-skin definition) ---
    if (this.click > 0) {
      const src = this.ctx.createBufferSource();
      src.buffer = createNoiseBuffer(this.ctx, 0.015);

      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 220;
      f.Q.value = 1.8;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(v * this.click * 1.1, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.012);

      src.connect(f); f.connect(g); g.connect(this.output);
      src.start(time); src.stop(time + 0.02);
    }

    // --- High-frequency noise snap (adds upper overtones / attack definition) ---
    {
      // Layer 1: mid-punch — fills the 600–2 kHz "body crack" range
      const midSrc = this.ctx.createBufferSource();
      midSrc.buffer = createNoiseBuffer(this.ctx, 0.04);

      const midHp = this.ctx.createBiquadFilter();
      midHp.type = 'highpass';
      midHp.frequency.value = 500;
      midHp.Q.value = 0.6;

      const midBp = this.ctx.createBiquadFilter();
      midBp.type = 'peaking';
      midBp.frequency.value = 1100;
      midBp.gain.value = 6;
      midBp.Q.value = 1.2;

      const midGain = this.ctx.createGain();
      midGain.gain.setValueAtTime(v * this.click * 0.55, time);
      midGain.gain.exponentialRampToValueAtTime(0.001, time + 0.028);

      midSrc.connect(midHp); midHp.connect(midBp); midBp.connect(midGain);
      midGain.connect(this.output);
      midSrc.start(time); midSrc.stop(time + 0.045);

      // Layer 2: air — short 4–8 kHz shimmer for presence on laptop speakers / headphones
      const airSrc = this.ctx.createBufferSource();
      airSrc.buffer = createNoiseBuffer(this.ctx, 0.022);

      const airHp = this.ctx.createBiquadFilter();
      airHp.type = 'highpass';
      airHp.frequency.value = 4000;
      airHp.Q.value = 0.7;

      const airGain = this.ctx.createGain();
      airGain.gain.setValueAtTime(v * this.click * 0.22, time);
      airGain.gain.exponentialRampToValueAtTime(0.001, time + 0.016);

      airSrc.connect(airHp); airHp.connect(airGain);
      airGain.connect(this.output);
      airSrc.start(time); airSrc.stop(time + 0.025);
    }

    // --- Deep sub-bass sine body ---
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';

    // Soft waveshaper adds warmth without harsh clipping
    const waveshaper = this.ctx.createWaveShaper();
    waveshaper.curve = makeDistortionCurve(8);

    const gainNode = this.ctx.createGain();

    // Cap start freq so extreme punch values stay musical
    const startFreq    = Math.min(this.tune * this.punch, 600);
    const sweepDur     = 0.065 + (this.punch - 1) * 0.015;

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(this.tune, time + sweepDur);

    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(v, time + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + this.decay);

    osc.connect(waveshaper);
    waveshaper.connect(gainNode);
    gainNode.connect(this.output);

    osc.start(time);
    osc.stop(time + this.decay + 0.05);
  }
}

export class SnareDrum {
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;
  }

  trigger(time, velocity = 1) {
    // --- Noise layer ---
    const noiseBuffer = createNoiseBuffer(this.ctx, 0.25);
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 3000;
    noiseFilter.Q.value = 0.8;

    const noiseGain = this.ctx.createGain();
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.output);

    noiseGain.gain.setValueAtTime(velocity * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    // --- Tonal body ---
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.frequency.value = 200;
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.05);

    osc.connect(oscGain);
    oscGain.connect(this.output);

    oscGain.gain.setValueAtTime(velocity * 0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.start(time);
    noise.stop(time + 0.3);
    osc.start(time);
    osc.stop(time + 0.15);
  }
}

export class HiHat {
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;
  }

  /**
   * @param {number}  time      AudioContext time to trigger
   * @param {number}  velocity  0–1
   * @param {boolean} open      Open hi-hat (longer decay)
   */
  trigger(time, velocity = 1, open = false) {
    const duration = open ? 0.35 : 0.06;
    const noise = this.ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(this.ctx, duration + 0.05);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = open ? 6000 : 8000;

    const gain = this.ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    gain.gain.setValueAtTime(velocity * 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.start(time);
    noise.stop(time + duration + 0.05);
  }
}

export class Clap {
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;
  }

  trigger(time, velocity = 1) {
    // Multiple layered noise bursts with short micro-delays mimic the room sound
    const offsets = [0, 0.008, 0.016, 0.032];
    offsets.forEach(offset => {
      const noise = this.ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(this.ctx, 0.1);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 1.5;

      const gain = this.ctx.createGain();
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.output);

      const t = time + offset;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(velocity * 0.6, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      noise.start(t);
      noise.stop(t + 0.12);
    });
  }
}

export class RimShot {
  /**
   * Short ghost-note / rim hit — used for ghost snare layers in DnB grooves.
   * @param {AudioContext} audioCtx
   * @param {AudioNode}    output
   */
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;
  }

  trigger(time, velocity = 1) {
    const v = Math.min(velocity, 1);

    // Tonal body — tuned click of stick on rim
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, time);
    osc.frequency.exponentialRampToValueAtTime(190, time + 0.022);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(v * 0.38, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.connect(oscGain);
    oscGain.connect(this.output);
    osc.start(time);
    osc.stop(time + 0.05);

    // Tight noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(this.ctx, 0.045);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3800;
    filter.Q.value = 2.5;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(v * 0.28, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.028);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.output);
    noise.start(time);
    noise.stop(time + 0.05);
  }
}

// --- Helpers ---

function createNoiseBuffer(ctx, duration) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function makeDistortionCurve(amount) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
