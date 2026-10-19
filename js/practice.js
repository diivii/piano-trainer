// Wait-mode practice logic. No display code here: it consumes steps from the
// score and normalized MIDI events, and reports progress through callbacks.
//
// Rules:
// - The session waits at each step until every required note has been pressed
//   (chord notes may be played one after another; they don't need to be exact).
// - With one hand selected, the other hand's notes are not required, and
//   playing them anyway is not counted as a mistake.
// - Any other note is a mistake (counted per measure), but doesn't block progress.

import { STAFF } from './score-view.js';

export const HANDS = { BOTH: 'both', RIGHT: 'right', LEFT: 'left' };

const GRACE_MS = 400;

export class PracticeSession {
  constructor(steps, { hands = HANDS.BOTH, fromMeasure = 1, toMeasure = Infinity, loop = false } = {}, callbacks = {}) {
    this.steps = steps;
    this.hands = hands;
    this.loop = loop;
    this.cb = callbacks;

    this.playable = steps.filter(
      (s) => s.measure >= fromMeasure && s.measure <= toMeasure && this.required(s).size > 0,
    );
    this.pos = 0;
    this.hit = new Set();
    this.finished = this.playable.length === 0;
    this.stats = {
      correct: 0,
      wrong: 0,
      laps: 0,
      startedAt: null,
      endedAt: null,
      mistakesByMeasure: {},
    };
  }

  required(step) {
    const wanted = (n) =>
      this.hands === HANDS.BOTH ||
      (this.hands === HANDS.RIGHT && n.staff === STAFF.RIGHT) ||
      (this.hands === HANDS.LEFT && n.staff === STAFF.LEFT);
    return new Set(step.notes.filter(wanted).map((n) => n.midi));
  }

  get current() {
    return this.playable[this.pos] ?? null;
  }

  start() {
    if (this.finished) {
      this.cb.onFinish?.(this.summary());
      return;
    }
    this.enterStep();
  }

  enterStep() {
    this.hit.clear();
    this.cb.onStep?.(this.current, this.required(this.current));
  }

  handle(event) {
    if (this.finished || event.type !== 'noteon') return;
    const step = this.current;
    const required = this.required(step);
    this.stats.startedAt ??= event.time;

    if (required.has(event.note)) {
      if (!this.hit.has(event.note)) {
        this.hit.add(event.note);
        this.stats.correct++;
        this.cb.onCorrect?.(event.note, step);
      }
      if (this.hit.size === required.size) this.advance(event.time);
      return;
    }

    // The other hand's notes in this step are fine when practicing one hand.
    if (step.notes.some((n) => n.midi === event.note)) return;

    // Notes of the step just completed, played slightly late (a chord that was
    // rolled, or the other hand lagging behind), aren't mistakes either.
    const prev = this.previous;
    if (prev && event.time - prev.time < GRACE_MS && prev.step.notes.some((n) => n.midi === event.note)) return;

    this.stats.wrong++;
    this.stats.mistakesByMeasure[step.measure] = (this.stats.mistakesByMeasure[step.measure] ?? 0) + 1;
    this.cb.onWrong?.(event.note, step);
  }

  advance(time) {
    this.previous = { step: this.current, time };
    this.pos++;
    if (this.pos >= this.playable.length) {
      this.stats.laps++;
      if (this.loop) {
        this.pos = 0;
        this.cb.onLap?.(this.summary(time));
      } else {
        this.finished = true;
        this.stats.endedAt = time;
        this.cb.onFinish?.(this.summary(time));
        return;
      }
    }
    this.enterStep();
  }

  summary(now = performance.now()) {
    const { correct, wrong, laps, startedAt, endedAt, mistakesByMeasure } = this.stats;
    const total = correct + wrong;
    const troubleMeasures = Object.entries(mistakesByMeasure)
      .sort((a, b) => b[1] - a[1])
      .map(([measure, count]) => ({ measure: Number(measure), count }));
    return {
      correct,
      wrong,
      accuracy: total ? correct / total : 1,
      laps,
      seconds: startedAt === null ? 0 : ((endedAt ?? now) - startedAt) / 1000,
      progress: this.playable.length ? this.pos / this.playable.length : 1,
      troubleMeasures,
    };
  }
}
