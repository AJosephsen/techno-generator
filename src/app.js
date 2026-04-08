import { SuperJX8 } from './synths.js';

const ROOT_NOTES = [
  { id: 'A2', midi: 45 },
  { id: 'C3', midi: 48 },
  { id: 'D3', midi: 50 },
  { id: 'E3', midi: 52 },
  { id: 'F3', midi: 53 },
];

const VOICINGS = [
  { id: 'single', label: 'Single', intervals: [0] },
  { id: 'fifth', label: 'Fifth Stack', intervals: [0, 7, 12] },
  { id: 'minor7', label: 'Minor 7', intervals: [0, 3, 7, 10] },
  { id: 'minor9', label: 'Minor 9', intervals: [0, 3, 7, 10, 14] },
];

let audioCtx = null;
let superSaw = null;
let isPlaying = false;
let selectedRoot = ROOT_NOTES[0].id;
let selectedVoicing = 'minor9';
let activeChordFreqs = []; // tracks which frequencies are currently ringing

function initAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.9;

  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.2;

  masterGain.connect(compressor);
  compressor.connect(audioCtx.destination);

  superSaw = new SuperJX8(audioCtx, masterGain);
  syncSynthParams();
}

function stopAll() {
  if (!superSaw) return;
  superSaw.allNotesOff();
  activeChordFreqs = [];
}

function playChord(newFreqs) {
  if (!superSaw) return;
  const now = audioCtx.currentTime;

  // Release notes no longer in the new chord
  activeChordFreqs.forEach(freq => {
    if (!newFreqs.some(f => Math.abs(f - freq) < 0.5)) {
      superSaw.noteOff(freq, now);
    }
  });

  // Start notes that are new
  newFreqs.forEach(freq => {
    if (!activeChordFreqs.some(f => Math.abs(f - freq) < 0.5)) {
      superSaw.noteOn(freq, now);
    }
  });

  activeChordFreqs = [...newFreqs];
}

function startStop() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const button = document.getElementById('startStop');
  if (isPlaying) {
    stopAll();
    isPlaying = false;
    button.textContent = 'PLAY';
    button.classList.remove('playing');
    return;
  }

  playChord(buildCurrentFrequencies());
  isPlaying = true;
  button.textContent = 'STOP';
  button.classList.add('playing');
}

function initUI() {
  renderButtonGroup('rootButtons', ROOT_NOTES, selectedRoot, item => item.id, item => item.id, id => {
    selectedRoot = id;
    renderSelections();
    updateChordReadout();
    if (isPlaying) playChord(buildCurrentFrequencies());
  });

  document.getElementById('startStop').addEventListener('click', startStop);

  bindSlider('filterCutoff', 'filterCutoffDisplay', value => {
    if (superSaw) superSaw.setFilter(value, superSaw.resonance);
    return `${Math.round(value)} Hz`;
  });
  bindSlider('filterResonance', 'filterResonanceDisplay', value => {
    if (superSaw) superSaw.setFilter(superSaw.filterCutoff, value);
    return value.toFixed(1);
  });
  bindSlider('lfoRate', 'lfoRateDisplay', value => {
    if (superSaw) superSaw.setLFO(value, superSaw.lfoDepth);
    return `${value.toFixed(2)} Hz`;
  });
  bindSlider('lfoDepth', 'lfoDepthDisplay', value => {
    if (superSaw) superSaw.setLFO(superSaw.lfoRate, value);
    return `${Math.round(value)} Hz`;
  });
  bindSlider('detuneAmount', 'detuneAmountDisplay', value => {
    if (superSaw) superSaw.setDetune(value);
    updateDistribution();
    return `${value.toFixed(1)} ct`;
  });
  bindSlider('mixBias', 'mixBiasDisplay', value => {
    if (superSaw) superSaw.setMixBias(value);
    updateDistribution();
    return formatBias(value);
  });
  bindSlider('outputLevel', 'outputLevelDisplay', value => {
    if (superSaw) superSaw.setLevel(value);
    updateDistribution();
    return `${Math.round(value * 100)}%`;
  });
  bindSlider('attack', 'attackDisplay', value => {
    if (superSaw) superSaw.setEnvelope(value, superSaw.release);
    return `${value.toFixed(2)} s`;
  });
  bindSlider('release', 'releaseDisplay', value => {
    if (superSaw) superSaw.setEnvelope(superSaw.attack, value);
    return `${value.toFixed(2)} s`;
  });

  updateChordReadout();
  updateDistribution();
}

function renderButtonGroup(containerId, items, selectedId, getId, getLabel, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  items.forEach(item => {
    const id = getId(item);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.dataset.value = id;
    button.textContent = getLabel(item);
    if (id === selectedId) button.classList.add('active');
    button.addEventListener('click', () => onSelect(id));
    container.appendChild(button);
  });
}

function renderSelections() {
  document.querySelectorAll('#rootButtons .choice-button').forEach(button => {
    button.classList.toggle('active', button.dataset.value === selectedRoot);
  });
  document.querySelectorAll('#voicingButtons .choice-button').forEach(button => {
    button.classList.toggle('active', button.dataset.value === selectedVoicing);
  });
}

function bindSlider(sliderId, displayId, onChange) {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  display.textContent = onChange(parseFloat(slider.value));
  slider.addEventListener('input', () => {
    display.textContent = onChange(parseFloat(slider.value));
  });
}

function syncSynthParams() {
  ['filterCutoff', 'filterResonance', 'lfoRate', 'lfoDepth', 'detuneAmount', 'mixBias', 'outputLevel', 'attack', 'release']
    .forEach(id => {
      const element = document.getElementById(id);
      if (element) element.dispatchEvent(new Event('input'));
    });
}

function buildCurrentFrequencies() {
  const root = ROOT_NOTES.find(note => note.id === selectedRoot);
  const voicing = VOICINGS.find(shape => shape.id === selectedVoicing);

  return voicing.intervals.map(interval => midiToFrequency(root.midi + interval));
}

function updateChordReadout() {
  const notes = buildCurrentFrequencies().map(freq => frequencyToNoteName(freq));
  document.getElementById('chordReadout').textContent = notes.join('  |  ');
}

function updateDistribution() {
  const detuneAmount = parseFloat(document.getElementById('detuneAmount').value);
  const mixBias = parseFloat(document.getElementById('mixBias').value);
  const outputLevel = parseFloat(document.getElementById('outputLevel').value);
  const profile = SuperJX8.describeOscillatorProfile(detuneAmount, mixBias);
  const plot = document.getElementById('oscillatorPlot');
  const maxWeight = Math.max(...profile.map(osc => osc.weight), 0.001);

  plot.innerHTML = '';
  profile.forEach(oscillator => {
    const bar = document.createElement('div');
    bar.className = 'osc-bar';
    bar.innerHTML = `
      <div class="osc-value">${Math.round(oscillator.detuneCents)} ct</div>
      <div class="osc-track">
        <div class="osc-fill" style="height:${(oscillator.weight / maxWeight) * 100}%"></div>
      </div>
      <div class="osc-label">${oscillator.label}</div>
      <div class="osc-weight">${Math.round(oscillator.weight * outputLevel * 100)}%</div>`;
    plot.appendChild(bar);
  });

  document.getElementById('distributionNote').textContent = distributionText(mixBias);
}

function distributionText(mixBias) {
  if (mixBias > 0.7) return 'Bias is strongly centered: the middle saw carries nearly all the energy.';
  if (mixBias > 0.2) return 'Bias is center-heavy: the side oscillators support the core pitch instead of matching it.';
  if (mixBias < -0.7) return 'Bias is strongly edge-heavy: the outer pair dominates, for a hollow wide swarm.';
  if (mixBias < -0.2) return 'Bias is edge-heavy: the extreme detuned oscillators lead the tone.';
  return 'Bias is neutral: the seven saws are averaged evenly.';
}

function formatBias(value) {
  if (value > 0.05) return `Center ${Math.round(value * 100)}%`;
  if (value < -0.05) return `Outer ${Math.round(Math.abs(value) * 100)}%`;
  return 'Equal';
}

function midiToFrequency(midiNote) {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function frequencyToNoteName(freq) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiNote = Math.round(12 * Math.log2(freq / 440) + 69);
  const noteName = noteNames[((midiNote % 12) + 12) % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${noteName}${octave}`;
}

document.addEventListener('DOMContentLoaded', initUI);
