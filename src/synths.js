const DETUNE_SHAPE = [-1.0, -0.63, -0.29, 0, 0.29, 0.63, 1.0];
const OSCILLATOR_LABELS = ['-3', '-2', '-1', 'C', '+1', '+2', '+3'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(weights) {
  const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
  return weights.map(weight => weight / sum);
}

function computeMixWeights(mixBias) {
  const amount = clamp(mixBias, -1, 1);
  const equal = new Array(DETUNE_SHAPE.length).fill(1 / DETUNE_SHAPE.length);
  const centerOnly = [0, 0, 0, 1, 0, 0, 0];
  const outerOnly = [0.5, 0, 0, 0, 0, 0, 0.5];
  const target = amount >= 0 ? centerOnly : outerOnly;
  const blend = Math.abs(amount);

  return normalize(equal.map((weight, index) => {
    return weight * (1 - blend) + target[index] * blend;
  }));
}

class SuperSawVoice {
  static describeOscillatorProfile(detuneAmount, mixBias) {
    const weights = computeMixWeights(mixBias);
    return DETUNE_SHAPE.map((shape, index) => ({
      index,
      label: OSCILLATOR_LABELS[index],
      detuneCents: shape * detuneAmount,
      weight: weights[index],
    }));
  }

  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    this.output = output || audioCtx.destination;

    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2800;
    this.filter.Q.value = 4;

    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 0.55;

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.output);

    this.lfo = audioCtx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.12;

    this.lfoGain = audioCtx.createGain();
    this.lfoGain.gain.value = 900;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    this.filterCutoff = 2800;
    this.resonance = 4;
    this.lfoRate = 0.12;
    this.lfoDepth = 900;
    this.detuneAmount = 18;
    this.mixBias = 0;
    this.level = 0.75;
    this.attack = 0.09;
    this.release = 0.9;
    this.activeChord = null;
  }

  setFilter(cutoff, q) {
    this.filterCutoff = cutoff;
    this.resonance = q;
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);
    this.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.05);
  }

  setLFO(rate, depth) {
    this.lfoRate = rate;
    this.lfoDepth = depth;
    this.lfo.frequency.setTargetAtTime(rate, this.ctx.currentTime, 0.08);
    this.lfoGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.08);
  }

  setDetune(amount) {
    this.detuneAmount = amount;
    this._applyCurrentOscillatorShape();
  }

  setMixBias(amount) {
    this.mixBias = amount;
    this._applyCurrentOscillatorShape();
  }

  setLevel(level) {
    this.level = level;
    this._applyCurrentOscillatorShape();
  }

  setEnvelope(attack, release) {
    this.attack = attack;
    this.release = release;
  }

  getOscillatorProfile() {
    return SuperSawVoice.describeOscillatorProfile(this.detuneAmount, this.mixBias);
  }

  startChord(frequencies, time = this.ctx.currentTime) {
    if (!frequencies.length) return;

    if (this.activeChord) {
      this.stopChord(Math.min(0.12, this.release * 0.25), time);
    }

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0, time);
    chordGain.gain.linearRampToValueAtTime(1, time + this.attack);
    chordGain.connect(this.filter);

    const oscillators = [];
    frequencies.forEach(frequency => {
      DETUNE_SHAPE.forEach((shape, index) => {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = frequency;
        osc.detune.value = shape * this.detuneAmount;

        osc.connect(oscGain);
        oscGain.connect(chordGain);

        osc.start(time);
        oscillators.push({ osc, oscGain, index });
      });
    });

    this.activeChord = {
      frequencies: [...frequencies],
      chordGain,
      oscillators,
    };

    this._applyCurrentOscillatorShape(time);
  }

  stopChord(release = this.release, time = this.ctx.currentTime) {
    if (!this.activeChord) return;

    const chord = this.activeChord;
    this.activeChord = null;

    if (typeof chord.chordGain.gain.cancelAndHoldAtTime === 'function') {
      chord.chordGain.gain.cancelAndHoldAtTime(time);
    } else {
      chord.chordGain.gain.cancelScheduledValues(time);
    }
    chord.chordGain.gain.linearRampToValueAtTime(0, time + release);

    chord.oscillators.forEach(({ osc, oscGain }) => {
      osc.stop(time + release + 0.05);
      osc.onended = () => {
        osc.disconnect();
        oscGain.disconnect();
      };
    });
  }

  _applyCurrentOscillatorShape(time = this.ctx.currentTime) {
    if (!this.activeChord) return;

    const profile = this.getOscillatorProfile();
    const notes = this.activeChord.frequencies.length;
    const noteScale = this.level / Math.max(1, notes);

    this.activeChord.oscillators.forEach(({ osc, oscGain, index }) => {
      osc.detune.setTargetAtTime(profile[index].detuneCents, time, 0.03);
      oscGain.gain.setTargetAtTime(profile[index].weight * noteScale, time, 0.03);
    });
  }
}

// ---------------------------------------------------------------------------
// SUPER JX-8  —  8-voice polyphonic supersaw engine
// Each voice is an independent SuperSawVoice. A per-voice sum gain of 1/8
// keeps the combined output at a comparable level to a single voice.
// ---------------------------------------------------------------------------

const VOICE_COUNT = 8;

export class SuperJX8 {
  static describeOscillatorProfile(detuneAmount, mixBias) {
    return SuperSawVoice.describeOscillatorProfile(detuneAmount, mixBias);
  }

  constructor(audioCtx, output = null) {
    this.ctx = audioCtx;
    const dest = output || audioCtx.destination;

    this.voices = Array.from({ length: VOICE_COUNT }, () => {
      // Scale each voice down so N simultaneous voices stay at a sane level
      const sumGain = audioCtx.createGain();
      sumGain.gain.value = 1 / VOICE_COUNT * 2.2; // slight boost back — 8 voices rarely all play
      sumGain.connect(dest);
      return {
        synth: new SuperSawVoice(audioCtx, sumGain),
        freq: null,
        startTime: -Infinity,
      };
    });

    // Mirror param state so callers can read them back
    const v0 = this.voices[0].synth;
    this.filterCutoff  = v0.filterCutoff;
    this.resonance     = v0.resonance;
    this.lfoRate       = v0.lfoRate;
    this.lfoDepth      = v0.lfoDepth;
    this.detuneAmount  = v0.detuneAmount;
    this.mixBias       = v0.mixBias;
    this.level         = v0.level;
    this.attack        = v0.attack;
    this.release       = v0.release;
  }

  // --- Voice allocation ---

  _freeVoice() {
    return this.voices.find(v => v.freq === null);
  }

  _voiceByFreq(freq) {
    return this.voices.find(v => v.freq !== null && Math.abs(v.freq - freq) < 0.5);
  }

  _stealVoice() {
    // Steal the voice that started playing earliest
    return this.voices.reduce((oldest, v) => v.startTime < oldest.startTime ? v : oldest);
  }

  noteOn(freq, time = this.ctx.currentTime) {
    if (this._voiceByFreq(freq)) return; // already playing

    const voice = this._freeVoice() || this._stealVoice();

    if (voice.freq !== null) {
      // Quick crossfade out of the stolen note
      voice.synth.stopChord(Math.min(0.06, this.release * 0.2), time);
    }

    voice.freq = freq;
    voice.startTime = time;
    voice.synth.startChord([freq], time);
  }

  noteOff(freq, time = this.ctx.currentTime) {
    const voice = this._voiceByFreq(freq);
    if (!voice) return;
    voice.synth.stopChord(this.release, time);
    voice.freq = null;
  }

  allNotesOff(time = this.ctx.currentTime) {
    this.voices.forEach(v => {
      if (v.freq !== null) {
        v.synth.stopChord(this.release, time);
        v.freq = null;
      }
    });
  }

  // --- Parameter broadcast to all voices ---

  setFilter(cutoff, q) {
    this.filterCutoff = cutoff;
    this.resonance = q;
    this.voices.forEach(v => v.synth.setFilter(cutoff, q));
  }

  setLFO(rate, depth) {
    this.lfoRate = rate;
    this.lfoDepth = depth;
    this.voices.forEach(v => v.synth.setLFO(rate, depth));
  }

  setDetune(amount) {
    this.detuneAmount = amount;
    this.voices.forEach(v => v.synth.setDetune(amount));
  }

  setMixBias(amount) {
    this.mixBias = amount;
    this.voices.forEach(v => v.synth.setMixBias(amount));
  }

  setLevel(level) {
    this.level = level;
    this.voices.forEach(v => v.synth.setLevel(level));
  }

  setEnvelope(attack, release) {
    this.attack = attack;
    this.release = release;
    this.voices.forEach(v => v.synth.setEnvelope(attack, release));
  }

  getOscillatorProfile() {
    return this.voices[0].synth.getOscillatorProfile();
  }
}
