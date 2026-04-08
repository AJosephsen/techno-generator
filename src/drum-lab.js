import { KickDrum, SnareDrum, RimShot, HiHat, Clap } from './drums.js';
import { Sequencer } from './sequencer.js';

// ---------------------------------------------------------------------------
// Track definitions
// ---------------------------------------------------------------------------

const TRACKS = [
  { id: 'kick',  label: 'KICK',  color: '#d8ff63', defaultLevel: 1.0  },
  { id: 'snare', label: 'SNARE', color: '#ff6f91', defaultLevel: 0.85 },
  { id: 'rim',   label: 'RIM',   color: '#79f7c1', defaultLevel: 0.55 },
  { id: 'chh',   label: 'CHH',   color: '#91a0c7', defaultLevel: 0.45 },
  { id: 'ohh',   label: 'OHH',   color: '#b8c7ef', defaultLevel: 0.55 },
  { id: 'clap',  label: 'CLAP',  color: '#ff9b72', defaultLevel: 0.7  },
];

// ---------------------------------------------------------------------------
// Presets  (0 = off · 0.4 = ghost note · 0.75 = accent · 1 = full)
// ---------------------------------------------------------------------------

const PRESETS = {
  'Two-Step': {
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    rim:   [0,0,0.4,0, 0,0,0,0.4, 0,0,0.4,0, 0,0,0,0.4],
    chh:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ohh:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  },
  'Amen': {
    kick:  [1,0,0,0, 0,0,0.75,0, 1,0,0,0, 0,0.75,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    rim:   [0,0,0.4,0, 0,0,0,0, 0,0.4,0,0, 0,0,0.4,0],
    chh:   [1,1,0,1, 0,1,1,0, 1,1,0,1, 0,1,1,0],
    ohh:   [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
    clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  'Rolling': {
    kick:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 0,0.75,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    rim:   [0,0,0,0, 0,0,0,0.4, 0,0,0,0, 0,0,0.4,0],
    chh:   [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
    ohh:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  },
  'Neurofunk': {
    kick:  [1,0,0,1, 0,0,0,0, 0,1,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0.75, 0,0,0,0, 1,0,0,0.75],
    rim:   [0,0.4,0,0, 0,0.4,0,0, 0,0.4,0,0, 0,0,0.4,0],
    chh:   [1,1,0,1, 1,0,1,0, 1,1,0,1, 1,0,1,0],
    ohh:   [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
    clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  'Jungle': {
    kick:  [1,0,0,0, 0,1,0,0, 0,0,0,1, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0.75, 0,0,0,0, 1,0,0,1],
    rim:   [0,0,0.4,0, 0,0,0.4,0, 0,0.4,0,0, 0,0,0.4,0],
    chh:   [1,0,1,1, 0,1,1,0, 1,0,1,1, 0,1,1,0],
    ohh:   [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0],
    clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let audioCtx   = null;
let sequencer  = null;
let isPlaying  = false;
let bpm        = 174;

let kick, snare, rim, chh, ohh, clap;
const trackGains = {};

// Mutable pattern state: trackId → Float32Array(16)
const patterns = {};
TRACKS.forEach(t => { patterns[t.id] = new Array(16).fill(0); });

let selectedPreset = 'Two-Step';

// ---------------------------------------------------------------------------
// Audio init
// ---------------------------------------------------------------------------

function initAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.88;

  // Limiter-style compressor to tame peaks
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value       = 3;
  comp.ratio.value      = 14;
  comp.attack.value     = 0.001;
  comp.release.value    = 0.08;

  masterGain.connect(comp);
  comp.connect(audioCtx.destination);

  // Per-track gain nodes
  TRACKS.forEach(t => {
    const g = audioCtx.createGain();
    g.gain.value = t.defaultLevel;
    g.connect(masterGain);
    trackGains[t.id] = g;
  });

  kick  = new KickDrum(audioCtx, trackGains.kick);
  snare = new SnareDrum(audioCtx, trackGains.snare);
  rim   = new RimShot(audioCtx, trackGains.rim);
  chh   = new HiHat(audioCtx, trackGains.chh);
  ohh   = new HiHat(audioCtx, trackGains.ohh);
  clap  = new Clap(audioCtx, trackGains.clap);

  syncKickParams();

  sequencer = new Sequencer(audioCtx, bpm);
  sequencer.addPattern('kick',  patterns.kick,  (t, v) => kick.trigger(t, v));
  sequencer.addPattern('snare', patterns.snare, (t, v) => snare.trigger(t, v));
  sequencer.addPattern('rim',   patterns.rim,   (t, v) => rim.trigger(t, v));
  sequencer.addPattern('chh',   patterns.chh,   (t, v) => chh.trigger(t, v, false));
  sequencer.addPattern('ohh',   patterns.ohh,   (t, v) => ohh.trigger(t, v, true));
  sequencer.addPattern('clap',  patterns.clap,  (t, v) => clap.trigger(t, v));

  sequencer.onStep = highlightStep;
}

// ---------------------------------------------------------------------------
// Kick voice → drum synth bridge
// ---------------------------------------------------------------------------

function syncKickParams() {
  if (!kick) return;
  kick.tune  = parseFloat(document.getElementById('kickTune').value);
  kick.decay = parseFloat(document.getElementById('kickDecay').value);
  kick.punch = parseFloat(document.getElementById('kickPunch').value);
  kick.click = parseFloat(document.getElementById('kickClick').value);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function startStop() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const btn = document.getElementById('startStop');
  if (isPlaying) {
    sequencer.stop();
    isPlaying = false;
    btn.textContent = 'PLAY';
    btn.classList.remove('playing');
    clearStepHighlight();
  } else {
    sequencer.start();
    isPlaying = true;
    btn.textContent = 'STOP';
    btn.classList.add('playing');
  }
}

// ---------------------------------------------------------------------------
// Step-button UI
// ---------------------------------------------------------------------------

function stepValueClass(value) {
  if (!value)    return '';
  if (value < 0.6) return 'on-ghost';
  return 'on-full';
}

function setStepVisual(trackId, step, value) {
  const btn = document.querySelector(`.step-btn[data-track="${trackId}"][data-step="${step}"]`);
  if (!btn) return;
  btn.classList.remove('on-full', 'on-ghost');
  const cls = stepValueClass(value);
  if (cls) btn.classList.add(cls);
}

function handleStepClick(trackId, step, event) {
  event.preventDefault();
  const current = patterns[trackId][step];
  let next;

  if (event.type === 'contextmenu') {
    // Right-click: toggle ghost note
    next = (current > 0 && current < 0.6) ? 0 : 0.4;
  } else {
    // Left-click: off → full → off  (or ghost → full if currently ghost)
    next = current >= 0.6 ? 0 : 1;
  }

  patterns[trackId][step] = next;
  setStepVisual(trackId, step, next);
  if (sequencer) sequencer.setPattern(trackId, patterns[trackId]);
}

// ---------------------------------------------------------------------------
// Grid builder
// ---------------------------------------------------------------------------

function buildGrid() {
  const container = document.getElementById('drumGrid');
  container.innerHTML = '';

  // Beat header row
  const headerRow = document.createElement('div');
  headerRow.className = 'drum-track beat-header-row';

  const spacer = document.createElement('div');
  spacer.className = 'track-info';
  headerRow.appendChild(spacer);

  const beatGroups = document.createElement('div');
  beatGroups.className = 'beat-groups';

  for (let beat = 0; beat < 4; beat++) {
    const group = document.createElement('div');
    group.className = 'beat-group';
    for (let sub = 0; sub < 4; sub++) {
      const label = document.createElement('span');
      label.className = 'beat-label';
      label.textContent = sub === 0 ? (beat + 1) : '·';
      group.appendChild(label);
    }
    beatGroups.appendChild(group);
  }
  headerRow.appendChild(beatGroups);
  container.appendChild(headerRow);

  // Track rows
  TRACKS.forEach(track => {
    const row = document.createElement('div');
    row.className = 'drum-track';
    row.style.setProperty('--step-color', track.color);
    row.style.setProperty('--step-color-ghost', hexAlpha(track.color, 0.28));

    const info = document.createElement('div');
    info.className = 'track-info';

    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = track.label;
    name.style.color = track.color;
    info.appendChild(name);

    row.appendChild(info);

    const groups = document.createElement('div');
    groups.className = 'beat-groups';

    for (let beat = 0; beat < 4; beat++) {
      const group = document.createElement('div');
      group.className = 'beat-group';

      for (let sub = 0; sub < 4; sub++) {
        const step = beat * 4 + sub;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'step-btn';
        btn.dataset.track = track.id;
        btn.dataset.step  = step;

        // Restore state from loaded preset
        const cls = stepValueClass(patterns[track.id][step]);
        if (cls) btn.classList.add(cls);

        btn.addEventListener('click',       e => handleStepClick(track.id, step, e));
        btn.addEventListener('contextmenu', e => handleStepClick(track.id, step, e));
        group.appendChild(btn);
      }

      groups.appendChild(group);
    }

    row.appendChild(groups);
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Mix panel
// ---------------------------------------------------------------------------

function buildMixPanel() {
  const container = document.getElementById('mixPanel');
  container.innerHTML = '';

  TRACKS.forEach(track => {
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = track.label;
    label.style.color = track.color;

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = '0';
    slider.max   = '1';
    slider.step  = '0.01';
    slider.value = track.defaultLevel;

    const display = document.createElement('span');
    display.className = 'value';
    display.textContent = `${Math.round(track.defaultLevel * 100)}%`;

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      display.textContent = `${Math.round(v * 100)}%`;
      if (trackGains[track.id]) trackGains[track.id].gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(display);
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Preset loader
// ---------------------------------------------------------------------------

function loadPreset(name) {
  selectedPreset = name;
  const preset = PRESETS[name];
  TRACKS.forEach(t => {
    for (let s = 0; s < 16; s++) {
      patterns[t.id][s] = preset[t.id]?.[s] ?? 0;
    }
    if (sequencer) sequencer.setPattern(t.id, patterns[t.id]);
  });
  // Redraw all step buttons
  TRACKS.forEach(t => {
    for (let s = 0; s < 16; s++) {
      setStepVisual(t.id, s, patterns[t.id][s]);
    }
  });
  // Update preset button selections
  document.querySelectorAll('#presetButtons .choice-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === name);
  });
}

function buildPresetButtons() {
  const container = document.getElementById('presetButtons');
  Object.keys(PRESETS).forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-button';
    btn.dataset.value = name;
    btn.textContent = name;
    if (name === selectedPreset) btn.classList.add('active');
    btn.addEventListener('click', () => loadPreset(name));
    container.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// Step highlight
// ---------------------------------------------------------------------------

function highlightStep(step) {
  document.querySelectorAll('.step-btn.current-step').forEach(b => b.classList.remove('current-step'));
  document.querySelectorAll(`.step-btn[data-step="${step}"]`).forEach(b => b.classList.add('current-step'));
}

function clearStepHighlight() {
  document.querySelectorAll('.step-btn.current-step').forEach(b => b.classList.remove('current-step'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function bindSlider(id, displayId, format, onChange) {
  const slider  = document.getElementById(id);
  const display = document.getElementById(displayId);
  if (!slider) return;
  display.textContent = format(parseFloat(slider.value));
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    display.textContent = format(v);
    onChange(v);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function init() {
  // Load initial preset into pattern arrays before building grid
  const preset = PRESETS[selectedPreset];
  TRACKS.forEach(t => {
    for (let s = 0; s < 16; s++) {
      patterns[t.id][s] = preset[t.id]?.[s] ?? 0;
    }
  });

  buildGrid();
  buildMixPanel();
  buildPresetButtons();

  document.getElementById('startStop').addEventListener('click', startStop);

  bindSlider('bpm', 'bpmDisplay', v => `${Math.round(v)} BPM`, v => {
    bpm = v;
    if (sequencer) sequencer.setBPM(v);
  });

  bindSlider('kickTune',  'kickTuneDisplay',  v => `${Math.round(v)} Hz`, () => syncKickParams());
  bindSlider('kickDecay', 'kickDecayDisplay', v => `${v.toFixed(2)} s`,   () => syncKickParams());
  bindSlider('kickPunch', 'kickPunchDisplay', v => `${v.toFixed(1)}×`,    () => syncKickParams());
  bindSlider('kickClick', 'kickClickDisplay', v => `${Math.round(v * 100)}%`, () => syncKickParams());
}

document.addEventListener('DOMContentLoaded', init);
