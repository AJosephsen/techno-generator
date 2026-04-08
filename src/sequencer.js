/**
 * sequencer.js — 16-step lookahead step sequencer
 *
 * Uses the Web Audio clock for sample-accurate scheduling while a
 * JavaScript timer fires periodically to keep the schedule buffer full.
 * This is the standard "dual-timer" pattern for reliable audio scheduling.
 */

export class Sequencer {
  /**
   * @param {AudioContext} audioCtx
   * @param {number}       bpm       Initial tempo (beats per minute)
   * @param {number}       steps     Number of steps per bar (default 16)
   * @param {object}       [options] Scheduling tuning options
   * @param {number}       [options.lookahead=25]       JS timer interval in ms
   * @param {number}       [options.scheduleAhead=0.1]  Web Audio look-ahead window in seconds
   */
  constructor(audioCtx, bpm = 135, steps = 16, { lookahead = 25, scheduleAhead = 0.1 } = {}) {
    this.ctx = audioCtx;
    this.bpm = bpm;
    this.steps = steps;

    this.stepDuration = this._calcStepDuration(bpm); // 16th-note duration in seconds
    this.currentStep = 0;
    this.nextNoteTime = 0;

    this.patterns = new Map();   // name → number[]  (0 = off, non-zero = velocity)
    this.callbacks = new Map();  // name → Function(time, value, step)

    this.isPlaying = false;
    this.lookahead = lookahead;             // ms — how often the scheduler fires
    this.scheduleAhead = scheduleAhead;     // s  — how far ahead to schedule audio

    this._timerID = null;

    /**
     * UI callback: called once per step at the time the step is *played*
     * (using a compensated setTimeout).  Signature: (step: number) => void
     */
    this.onStep = null;
  }

  _calcStepDuration(bpm) {
    return (60 / bpm) / 4; // one 16th note at given BPM
  }

  setBPM(bpm) {
    this.bpm = bpm;
    this.stepDuration = this._calcStepDuration(bpm);
  }

  /**
   * Register a pattern track.
   * @param {string}   name      Unique track name
   * @param {number[]} pattern   16-element array; 0 = silent, non-zero = velocity hint
   * @param {Function} callback  Called at note time: (time, value, step) => void
   */
  addPattern(name, pattern, callback) {
    this.patterns.set(name, [...pattern]);
    this.callbacks.set(name, callback);
  }

  /** Replace an existing pattern's step array (safe to call while playing). */
  setPattern(name, pattern) {
    this.patterns.set(name, [...pattern]);
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05; // small startup offset
    this._schedule();
  }

  stop() {
    this.isPlaying = false;
    if (this._timerID !== null) {
      clearTimeout(this._timerID);
      this._timerID = null;
    }
  }

  // --- Private ---

  _schedule() {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      this._triggerStep(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += this.stepDuration;
      this.currentStep = (this.currentStep + 1) % this.steps;
    }
    if (this.isPlaying) {
      this._timerID = setTimeout(() => this._schedule(), this.lookahead);
    }
  }

  _triggerStep(step, time) {
    // Schedule UI highlight at the moment the step actually sounds
    if (this.onStep) {
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => { if (this.onStep) this.onStep(step); }, delayMs);
    }

    // Trigger each pattern track
    for (const [name, pattern] of this.patterns) {
      const value = pattern[step];
      if (value) {
        const cb = this.callbacks.get(name);
        if (cb) cb(time, value, step);
      }
    }
  }
}
