# 🎛️ Techno Generator

Parametric techno electronica rave generator synth — built entirely with the
**Web Audio API** and vanilla JavaScript ES modules. No build tools, no
dependencies.

## Features

| Synth / Module | Description |
|---|---|
| **Kick Drum** | Sine oscillator with fast pitch envelope (180 → 40 Hz) + soft waveshaper distortion |
| **Snare Drum** | Bandpass-filtered noise burst + pitched tonal body |
| **Hi-Hat** | Closed and open variants — highpass-filtered white noise |
| **Clap** | Four overlapping noise bursts with micro-delays for natural smear |
| **Bass Synth** | TB-303 style: sawtooth + resonant low-pass + filter envelope with env-mod amount |
| **Super Saw** | 7 detuned sawtooth oscillators per voice + resonant filter + slow LFO sweep |
| **Step Sequencer** | 16-step lookahead scheduler (dual-timer pattern) with per-track toggle grid |
| **Chord Progression** | Am → Gm → Fm → Em cycling every bar, visualised in real time |

## Running locally

ES Modules require a local HTTP server (they won't load over `file://`).

```bash
# Option 1 — one-liner (no install needed)
npx serve . -p 3000

# Option 2 — via package.json
npm start

# Option 3 — Python built-in
python3 -m http.server 3000
```

Then open **http://localhost:3000** in any modern browser and press **▶ START**.

## Controls

- **BPM slider** — tempo from 100 to 180 BPM
- **Step grid** — click any step cell to toggle it on/off while playing
- **Bass Synth** — Filter Cutoff, Resonance (Q), Envelope Modulation amount
- **Super Saw** — Filter Cutoff, Resonance, LFO Speed, LFO Depth, Detune Spread

## Architecture

```
src/
  drums.js      KickDrum, SnareDrum, HiHat, Clap
  synths.js     BassSynth, SuperSawSynth
  sequencer.js  16-step lookahead Sequencer
  app.js        Demo patterns, master bus, UI wiring
styles/
  main.css      Dark industrial theme
index.html      Single-page application shell
```

All audio is routed through a master gain → dynamics compressor chain before
reaching the speakers, preventing clipping even when many voices play
simultaneously.
