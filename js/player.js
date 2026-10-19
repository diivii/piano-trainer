// Plays (part of) a piece so the player can hear it first: either through the
// digital piano itself (MIDI out, real piano sound) or with a simple
// piano-like synth on the device. No display code; progress is reported
// through callbacks so the cursor and keyboard can follow along.

import { STAFF } from './score-view.js';

const LOOKAHEAD_MS = 40; // send notes this far ahead of time
const TICK_MS = 15;
const VELOCITY = 72;

export class Player {
  constructor() {
    this.ctx = null;
    this.timer = null;
  }

  get playing() {
    return this.timer !== null;
  }

  // iOS only allows audio after a user gesture, so call this from a tap.
  unlock() {
    this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // options: { hands, fromMeasure, toMeasure, tempo (quarter notes per minute) }
  // output: a MIDI output port to play on the piano, or null for the device sound
  // callbacks: onStep(step), onNotes(set of sounding notes), onEnd()
  play(piece, options, output, callbacks = {}) {
    this.stop();
    const { hands = 'both', fromMeasure = 1, toMeasure = Infinity, tempo = 90 } = options;
    const measures = piece.measures.filter((m) => m.number >= fromMeasure && m.number <= toMeasure);
    if (!measures.length) return;
    const startAt = measures[0].start;
    const endAt = measures.at(-1).start + measures.at(-1).duration;
    const msPerWhole = (4 * 60000) / tempo;
    const wanted = (n) => hands === 'both' || (hands === 'right' ? n.staff === STAFF.RIGHT : n.staff === STAFF.LEFT);

    const t0 = performance.now() + 150;
    const at = (wholeNotes) => t0 + (wholeNotes - startAt) * msPerWhole;

    const steps = piece.steps.filter((s) => s.time >= startAt && s.time < endAt && s.notes.some(wanted));
    // One on and one off event per note, sorted by time.
    const events = steps
      .flatMap((s) => s.notes.filter(wanted).flatMap((n) => {
        const on = at(s.time);
        // End slightly early so repeated notes are struck again audibly.
        const off = Math.max(on + 30, at(Math.min(s.time + n.duration, endAt)) - 25);
        return [{ time: on, type: 'on', midi: n.midi }, { time: off, type: 'off', midi: n.midi }];
      }))
      .sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));

    this.output = output;
    this.cb = callbacks;
    this.voices = new Map(); // midi -> synth voice (device sound)
    this.active = new Set(); // notes sent to the piano and not yet released
    this.sounding = new Set(); // notes sounding right now (for the display)
    let next = 0; // next event to send
    let shown = 0; // next event to show on the keyboard
    let stepIndex = 0;
    const lastTime = events.at(-1)?.time ?? t0;

    this.timer = setInterval(() => {
      const now = performance.now();
      while (next < events.length && events[next].time <= now + LOOKAHEAD_MS) this.send(events[next++]);
      // The display follows the actual time, not the lookahead.
      let changed = false;
      while (shown < events.length && events[shown].time <= now) {
        const e = events[shown++];
        if (e.type === 'on') this.sounding.add(e.midi);
        else this.sounding.delete(e.midi);
        changed = true;
      }
      if (changed) this.cb.onNotes?.(new Set(this.sounding));
      while (stepIndex < steps.length && at(steps[stepIndex].time) <= now) this.cb.onStep?.(steps[stepIndex++]);
      if (now > lastTime + 200) this.finish();
    }, TICK_MS);
  }

  send(e) {
    if (this.output) {
      if (e.type === 'on') this.active.add(e.midi);
      else this.active.delete(e.midi);
      const data = e.type === 'on' ? [0x90, e.midi, VELOCITY] : [0x80, e.midi, 0];
      try {
        this.output.send(data, e.time);
      } catch {
        this.output.send(data);
      }
      return;
    }
    if (e.type === 'on') {
      this.voices.get(e.midi)?.stop(e.time);
      this.voices.set(e.midi, this.voice(e.midi, e.time));
    } else {
      this.voices.get(e.midi)?.stop(e.time);
      this.voices.delete(e.midi);
    }
  }

  // A simple piano-like tone: a few harmonics with a quick attack and a decay.
  voice(midi, time) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const when = ctx.currentTime + Math.max(0, (time - performance.now()) / 1000);
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const gain = ctx.createGain();
    const level = 0.16;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.006);
    gain.gain.setTargetAtTime(level * 0.25, when + 0.006, 0.5); // natural decay while held
    gain.connect(ctx.destination);
    const oscillators = [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1]].map(([k, amount]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq * k;
      g.gain.value = amount;
      osc.connect(g).connect(gain);
      osc.start(when);
      return osc;
    });
    return {
      stop: (offTime) => {
        const off = Math.max(when + 0.01, ctx.currentTime + Math.max(0, (offTime - performance.now()) / 1000));
        gain.gain.cancelScheduledValues(off);
        gain.gain.setTargetAtTime(0, off, 0.06);
        oscillators.forEach((o) => o.stop(off + 0.4));
      },
    };
  }

  finish() {
    this.stop();
    this.cb?.onEnd?.();
  }

  stop() {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    const now = performance.now();
    if (this.output) {
      // Notes already sent ahead may still be on their way, so release
      // everything just after them.
      const later = now + LOOKAHEAD_MS + 10;
      for (const midi of [...this.active]) this.send({ type: 'off', midi, time: later });
      try {
        this.output.send([0xb0, 123, 0], later); // all notes off
      } catch {
        // not every implementation accepts it
      }
    }
    for (const voice of this.voices.values()) voice?.stop(now);
    this.voices.clear();
    this.sounding.clear();
    this.cb?.onNotes?.(new Set());
  }
}
