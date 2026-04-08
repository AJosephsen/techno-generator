/**
 * drums.js — Electronic drum synthesizers for techno music
 *
 * Each drum class takes an AudioContext and an optional output AudioNode.
 * All synths are created fresh per-trigger so they're garbage-collected after
 * the note ends. No persistent oscillator state is kept per instance.
 */

export class KickDrum {
  /**
   * @param {AudioContext} audioCtx
   * @param {AudioNode} output  Destination node (default: audioCtx.destination)
   */
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;
  }

  trigger(time, velocity = 1) {
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const distortion = this.ctx.createWaveShaper();
    distortion.curve = makeDistortionCurve(30);

    osc.connect(gainNode);
    gainNode.connect(distortion);
    distortion.connect(this.output);

    // Pitch envelope: fast drop from ~180 Hz to ~40 Hz (the "thud")
    osc.frequency.setValueAtTime(180 * Math.min(velocity, 1.0), time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);

    // Amplitude envelope
    gainNode.gain.setValueAtTime(velocity, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

    osc.start(time);
    osc.stop(time + 0.5);
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
