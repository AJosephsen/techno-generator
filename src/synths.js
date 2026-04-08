/**
 * synths.js — Software synthesizers for techno and rave music
 *
 * BassSynth   — TB-303 style acid bass: sawtooth + resonant low-pass + filter envelope
 * SuperSawSynth — 7 detuned sawtooth oscillators + resonant filter + LFO sweep
 */

export class BassSynth {
  /**
   * @param {AudioContext} audioCtx
   * @param {AudioNode}    output   Destination node (default: audioCtx.destination)
   */
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;

    // Resonant low-pass filter — the heart of the acid sound
    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 800;
    this.filter.Q.value = 8;

    // Master gain
    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 0.65;

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.output);

    // Exposed parameters (also reflected in filter node)
    this.filterCutoff = 800;
    this.resonance = 8;
    this.envMod = 2000; // How many Hz the filter envelope adds at peak
  }

  setFilter(cutoff, q) {
    this.filterCutoff = cutoff;
    this.resonance = q;
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);
    this.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.05);
  }

  setEnvMod(amount) {
    this.envMod = amount;
  }

  /**
   * Trigger a bass note.
   * @param {number}  frequency  Note frequency in Hz
   * @param {number}  time       AudioContext time
   * @param {number}  duration   Note duration in seconds
   * @param {boolean} accent     Accented note (louder, sharper filter envelope)
   */
  trigger(frequency, time, duration, accent = false) {
    const osc = this.ctx.createOscillator();
    const ampEnv = this.ctx.createGain();
    const vel = accent ? 1.0 : 0.6;

    osc.type = 'sawtooth';
    osc.frequency.value = frequency;
    osc.connect(ampEnv);
    ampEnv.connect(this.filter);

    // Amplitude envelope
    ampEnv.gain.setValueAtTime(0, time);
    ampEnv.gain.linearRampToValueAtTime(vel, time + 0.005);
    ampEnv.gain.setValueAtTime(vel, time + duration * 0.8);
    ampEnv.gain.linearRampToValueAtTime(0, time + duration);

    // Filter envelope: opens up from the top then decays to base cutoff
    const envPeak = this.filterCutoff + this.envMod * (accent ? 1.2 : 1.0);
    this.filter.frequency.cancelAndHoldAtTime(time);
    this.filter.frequency.setValueAtTime(Math.min(envPeak, 18000), time);
    this.filter.frequency.exponentialRampToValueAtTime(
      Math.max(this.filterCutoff, 20),
      time + duration
    );

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}

export class SuperSawSynth {
  /**
   * @param {AudioContext} audioCtx
   * @param {AudioNode}    output   Destination node (default: audioCtx.destination)
   */
  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;

    // Resonant low-pass filter
    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 5;

    // Master gain (lower than bass to sit nicely in the mix)
    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 0.22;

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.output);

    // Slow LFO for the signature sweeping resonance filter effect
    this.lfo = audioCtx.createOscillator();
    this.lfoGain = audioCtx.createGain();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.25; // Hz
    this.lfoGain.gain.value = 1500;  // sweep depth in Hz
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    // Exposed parameters
    this.filterCutoff = 2000;
    this.resonance = 5;
    this.lfoRate = 0.25;
    this.lfoDepth = 1500;
    this.detuneSpread = 12; // cents per step
  }

  setFilter(cutoff, q) {
    this.filterCutoff = cutoff;
    this.resonance = q;
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.1);
    this.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.1);
  }

  setLFO(rate, depth) {
    this.lfoRate = rate;
    this.lfoDepth = depth;
    this.lfo.frequency.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
    this.lfoGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.1);
  }

  setDetune(spread) {
    this.detuneSpread = spread;
  }

  /**
   * Play a chord using stacked detuned sawtooth oscillators (super saw).
   * 7 oscillators per frequency give the characteristic thick, wide timbre.
   *
   * @param {number[]} frequencies  Array of note frequencies in Hz
   * @param {number}   time         AudioContext start time
   * @param {number}   duration     Duration in seconds
   */
  playChord(frequencies, time, duration) {
    // 7-oscillator super saw detuning table (in cents)
    const d = this.detuneSpread;
    const detunings = [-d * 2.5, -d * 1.5, -d * 0.5, 0, d * 0.5, d * 1.5, d * 2.5];

    const gainPerOsc = 0.9 / (frequencies.length * detunings.length);

    frequencies.forEach(freq => {
      detunings.forEach(detune => {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detune;

        osc.connect(oscGain);
        oscGain.connect(this.filter);

        // Soft attack, sustain, release envelope
        oscGain.gain.setValueAtTime(0, time);
        oscGain.gain.linearRampToValueAtTime(gainPerOsc, time + 0.06);
        oscGain.gain.setValueAtTime(gainPerOsc, time + duration - 0.12);
        oscGain.gain.linearRampToValueAtTime(0, time + duration);

        osc.start(time);
        osc.stop(time + duration + 0.1);
      });
    });
  }
}
