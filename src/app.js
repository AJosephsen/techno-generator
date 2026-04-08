/**
 * app.js — Techno Generator application entry point
 *
 * Sets up the audio graph, demo patterns, and all UI interactions.
 */

import { KickDrum, SnareDrum, HiHat, Clap }   from './drums.js';
import { BassSynth, SuperSawSynth }             from './synths.js';
import { Sequencer }                            from './sequencer.js';

// ─── Demo patterns (16 steps = 1 bar) ────────────────────────────────────────

const PATTERNS = {
  kick:  [1, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0], // 4-on-the-floor
  snare: [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0], // beats 2 & 4
  hihat: [1, 0, 1, 0,  1, 0, 1, 0,  1, 0, 1, 0,  1, 0, 1, 0], // 8th notes
  openH: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 1], // bar-end open HH
  clap:  [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0], // off by default
  chord: [1, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0], // once per bar
};

// Bass acid line — non-zero values are MIDI-style Hz frequencies; 0 = rest
const A1 = 55.0,  D2 = 73.4,  E2 = 82.4,  G2 = 98.0,  A2 = 110.0;

const BASS_PATTERN  = [A1, 0,  A1, 0,   A1, 0,  0,  A2,   G2, 0,  G2, 0,   E2, 0,  D2, E2];
const BASS_ACCENTS  = [1,  0,  0,  0,   1,  0,  0,  1,    0,  0,  1,  0,   1,  0,  0,  1 ];

// Chord progression — one chord per bar, cycling Am → Gm → Fm → Em
const CHORD_NAMES = ['Am', 'Gm', 'Fm', 'Em'];
const CHORD_FREQS = [
  [220.0, 261.6, 329.6], // Am: A3–C4–E4
  [196.0, 233.1, 293.7], // Gm: G3–Bb3–D4
  [174.6, 207.7, 261.6], // Fm: F3–Ab3–C4
  [164.8, 196.0, 246.9], // Em: E3–G3–B3
];

// ─── State ────────────────────────────────────────────────────────────────────

let audioCtx    = null;
let masterBus   = null; // masterGain → compressor → destination
let sequencer   = null;
let kick, snare, hihat, clap, bassSynth, superSaw;
let isPlaying   = false;
let chordIdx    = 0;     // current chord (incremented each bar)

// ─── Audio initialisation ─────────────────────────────────────────────────────

function initAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  // Master bus: gain → compressor → speakers
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.85;

  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value      = 10;
  compressor.ratio.value     = 4;
  compressor.attack.value    = 0.005;
  compressor.release.value   = 0.1;

  masterGain.connect(compressor);
  compressor.connect(audioCtx.destination);
  masterBus = masterGain;

  // Instruments all route through the master bus
  kick     = new KickDrum(audioCtx, masterBus);
  snare    = new SnareDrum(audioCtx, masterBus);
  hihat    = new HiHat(audioCtx, masterBus);
  clap     = new Clap(audioCtx, masterBus);
  bassSynth  = new BassSynth(audioCtx, masterBus);
  superSaw   = new SuperSawSynth(audioCtx, masterBus);

  // Apply initial UI slider values to synths
  syncSynthParams();

  // Build sequencer
  const bpm = parseInt(document.getElementById('bpm').value, 10);
  sequencer = new Sequencer(audioCtx, bpm);

  // Drums
  sequencer.addPattern('kick',  PATTERNS.kick,  (t)       => kick.trigger(t, 1));
  sequencer.addPattern('snare', PATTERNS.snare, (t)       => snare.trigger(t, 0.9));
  sequencer.addPattern('hihat', PATTERNS.hihat, (t, v)    => hihat.trigger(t, v === 2 ? 0.7 : 0.35));
  sequencer.addPattern('openH', PATTERNS.openH, (t)       => hihat.trigger(t, 0.55, true));
  sequencer.addPattern('clap',  PATTERNS.clap,  (t)       => clap.trigger(t, 0.8));

  // Bass acid line
  sequencer.addPattern('bass', BASS_PATTERN, (t, freq, step) => {
    if (freq > 0) {
      const dur    = sequencer.stepDuration * 0.88;
      const accent = BASS_ACCENTS[step] === 1;
      bassSynth.trigger(freq, t, dur, accent);
    }
  });

  // Chord — fires once per bar (step 0); advance chord index each time
  sequencer.addPattern('chord', PATTERNS.chord, (t) => {
    const idx      = chordIdx % CHORD_FREQS.length;
    const duration = sequencer.stepDuration * 15.5; // nearly a full bar
    superSaw.playChord(CHORD_FREQS[idx], t, duration);

    // Schedule UI chord highlight at playback time
    const delayMs = Math.max(0, (t - audioCtx.currentTime) * 1000);
    setTimeout(() => highlightChord(idx), delayMs);

    chordIdx++;
  });

  // Step-indicator callback drives the sequencer grid visuals
  sequencer.onStep = (step) => highlightStep(step);
}

// ─── Transport ────────────────────────────────────────────────────────────────

function startStop() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const btn = document.getElementById('startStop');
  if (isPlaying) {
    sequencer.stop();
    isPlaying = false;
    btn.textContent = '▶  START';
    btn.classList.remove('playing');
    clearStepHighlights();
  } else {
    chordIdx = 0;
    sequencer.start();
    isPlaying = true;
    btn.textContent = '⏹  STOP';
    btn.classList.add('playing');
  }
}

// ─── UI ───────────────────────────────────────────────────────────────────────

const TRACKS = [
  { id: 'kickSteps',     key: 'kick'  },
  { id: 'snareSteps',    key: 'snare' },
  { id: 'hihatSteps',    key: 'hihat' },
  { id: 'openHihatSteps',key: 'openH' },
  { id: 'clapSteps',     key: 'clap'  },
];

function initUI() {
  // Build the step-sequencer grid
  TRACKS.forEach(({ id, key }) => {
    const container = document.getElementById(id);
    if (!container) return;
    for (let i = 0; i < 16; i++) {
      const btn = document.createElement('div');
      btn.className   = 'step';
      btn.dataset.step  = i;
      btn.dataset.track = key;
      if (PATTERNS[key][i]) btn.classList.add('active');
      btn.addEventListener('click', () => toggleStep(key, i, btn));
      container.appendChild(btn);
    }
  });

  // Build chord progression display
  const chordContainer = document.getElementById('chordIndicators');
  CHORD_NAMES.forEach((name, i) => {
    const div = document.createElement('div');
    div.className = 'chord-indicator';
    div.id        = `chord-${i}`;
    div.innerHTML = `
      <div class="chord-name">${name}</div>
      <div class="chord-notes">${CHORD_FREQS[i].map(freqToNoteName).join(' – ')}</div>`;
    chordContainer.appendChild(div);
  });

  // Transport
  document.getElementById('startStop').addEventListener('click', startStop);

  // BPM slider
  const bpmSlider   = document.getElementById('bpm');
  const bpmDisplay  = document.getElementById('bpmDisplay');
  bpmSlider.addEventListener('input', () => {
    bpmDisplay.textContent = bpmSlider.value;
    if (sequencer) sequencer.setBPM(parseInt(bpmSlider.value, 10));
  });

  // Bass synth sliders
  bindSlider('bassFilter',    'bassFilterDisplay',    v => { if (bassSynth) bassSynth.setFilter(v, bassSynth.resonance);      return fmtHz(v); });
  bindSlider('bassResonance', 'bassResonanceDisplay', v => { if (bassSynth) bassSynth.setFilter(bassSynth.filterCutoff, v);   return fmtQ(v); });
  bindSlider('bassEnvMod',    'bassEnvModDisplay',    v => { if (bassSynth) bassSynth.setEnvMod(v);                           return fmtInt(v); });

  // Super saw sliders
  bindSlider('sawFilter',    'sawFilterDisplay',    v => { if (superSaw) superSaw.setFilter(v, superSaw.resonance);           return fmtHz(v); });
  bindSlider('sawResonance', 'sawResonanceDisplay', v => { if (superSaw) superSaw.setFilter(superSaw.filterCutoff, v);        return fmtQ(v); });
  bindSlider('sawLFO',       'sawLFODisplay',       v => { if (superSaw) superSaw.setLFO(v, superSaw.lfoDepth);               return fmtLFOHz(v); });
  bindSlider('sawLFODepth',  'sawLFODepthDisplay',  v => { if (superSaw) superSaw.setLFO(superSaw.lfoRate, v);                return fmtInt(v); });
  bindSlider('sawDetune',    'sawDetuneDisplay',    v => { if (superSaw) superSaw.setDetune(v);                               return fmtCents(v); });
}

// ─── Display formatters ────────────────────────────────────────────────────────

const fmtHz     = v => `${Math.round(v)} Hz`;
const fmtQ      = v => v.toFixed(1);
const fmtInt    = v => String(Math.round(v));
const fmtLFOHz  = v => `${v.toFixed(2)} Hz`;
const fmtCents  = v => `${Math.round(v)} ct`;

/** Wire a range input to a display span and an onChange handler. */
function bindSlider(sliderId, displayId, onChange) {
  const slider  = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  if (!slider || !display) return;
  // Set initial display from slider's default value
  display.textContent = onChange(parseFloat(slider.value));
  slider.addEventListener('input', () => {
    display.textContent = onChange(parseFloat(slider.value));
  });
}

/** Apply all current slider values to freshly created synth instances. */
function syncSynthParams() {
  ['bassFilter','bassResonance','bassEnvMod','sawFilter','sawResonance',
   'sawLFO','sawLFODepth','sawDetune'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.dispatchEvent(new Event('input'));
  });
}

function toggleStep(trackKey, stepIndex, btn) {
  PATTERNS[trackKey][stepIndex] = PATTERNS[trackKey][stepIndex] ? 0 : 1;
  btn.classList.toggle('active', !!PATTERNS[trackKey][stepIndex]);
  if (sequencer) sequencer.setPattern(trackKey, PATTERNS[trackKey]);
}

// ─── Visual feedback ──────────────────────────────────────────────────────────

let lastStep = -1;

function highlightStep(step) {
  if (lastStep >= 0) {
    document.querySelectorAll(`.step[data-step="${lastStep}"]`)
      .forEach(el => el.classList.remove('playing'));
  }
  document.querySelectorAll(`.step[data-step="${step}"]`)
    .forEach(el => el.classList.add('playing'));
  lastStep = step;
}

function clearStepHighlights() {
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));
  lastStep = -1;
}

function highlightChord(idx) {
  document.querySelectorAll('.chord-indicator').forEach(el => el.classList.remove('current'));
  const el = document.getElementById(`chord-${idx}`);
  if (el) el.classList.add('current');
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/** Convert a frequency in Hz to a human-readable note name like "A3". */
function freqToNoteName(freq) {
  const midiNote  = Math.round(12 * Math.log2(freq / 440) + 69);
  const noteName  = NOTE_NAMES[((midiNote % 12) + 12) % 12];
  const octave    = Math.floor(midiNote / 12) - 1;
  return `${noteName}${octave}`;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initUI);
