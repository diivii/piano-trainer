// Tempo-mode practice: the score runs at a fixed tempo with a metronome, and
// each note is judged on timing (on time / early / late / missed). Wrong notes
// are counted but never stop the music. Same interface as PracticeSession.

import { requiredNotes } from './practice.js';

const LOOKAHEAD_MS = 150;

export const JUDGEMENT = { ON_TIME: 'on-time', EARLY: 'early', LATE: 'late', MISSED: 'missed' };

export class TempoSession {
  constructor(piece, { hands = 'both', fromMeasure = 1, toMeasure = Infinity, loop = false, tempo = 60, metronome = true } = {}, callbacks = {}, clicker = null) {
    this.mode = 'tempo';
    this.hands = hands;
    this.loop = loop;
    this.cb = callbacks;
    this.clicker = metronome ? clicker : null;

    const measures = piece.measures.filter((m) => m.number >= fromMeasure && m.number <= toMeasure);
    this.startAt = measures[0]?.start ?? 0;
    this.endAt = measures.length ? measures.at(-1).start + measures.at(-1).duration : 0;
    this.msPerWhole = (4 * 60000) / tempo;

    const beatMs = 60000 / tempo;
    this.window = Math.max(150, Math.min(400, beatMs * 0.5)); // max distance to count as an attempt
    this.onTimeWindow = Math.max(80, Math.min(160, beatMs * 0.2));

    // Copies, since each step gets a `pending` set of notes not yet played this lap.
    this.steps = piece.steps.filter((s) => s.time >= this.startAt && s.time < this.endAt).map((s) => ({ ...s }));
    this.beats = measures.flatMap((m) =>
      [...Array(m.beats).keys()].map((b) => ({ at: m.start + b / m.beatType, accent: b === 0 })),
    );
    this.countIn = { beats: measures[0]?.beats ?? 4, beatMs: (this.msPerWhole / (measures[0]?.beatType ?? 4)) };

    this.finished = this.steps.length === 0;
    this.timer = null;
    this.stats = { onTime: 0, early: 0, late: 0, missed: 0, wrong: 0, laps: 0, mistakesByMeasure: {} };
  }

  required(step) {
    return requiredNotes(step, this.hands);
  }

  // Performance time (ms) at which a score position (whole notes) is due.
  due(at) {
    return this.t0 + (at - this.startAt) * this.msPerWhole;
  }

  get current() {
    return this.steps.find((s) => s.pending.size > 0) ?? null;
  }

  start() {
    if (this.finished) {
      this.cb.onFinish?.(this.summary());
      return;
    }
    const now = performance.now();
    const { beats, beatMs } = this.countIn;
    this.t0 = now + 300 + beats * beatMs;
    this.startedAt = this.t0;
    for (let b = 0; b < beats; b++) this.clicker?.click(this.t0 - (beats - b) * beatMs, b === 0);
    this.cb.onCountIn?.(beats, beatMs, this.t0);
    this.beginLap();
    this.timer = setInterval(() => this.tick(performance.now()), 20);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  beginLap() {
    for (const s of this.steps) s.pending = this.required(s);
    this.nextBeat = 0;
    this.shownStep = -1;
    this.lapStart = { ...this.stats };
  }

  tick(now) {
    // Metronome clicks, scheduled slightly ahead.
    while (this.nextBeat < this.beats.length && this.due(this.beats[this.nextBeat].at) < now + LOOKAHEAD_MS) {
      const beat = this.beats[this.nextBeat++];
      this.clicker?.click(this.due(beat.at), beat.accent);
    }

    // Cursor follows the music.
    let pos = -1;
    for (let i = 0; i < this.steps.length && this.due(this.steps[i].time) <= now + 30; i++) pos = i;
    if (pos !== this.shownStep && pos >= 0) {
      this.shownStep = pos;
      this.cb.onStep?.(this.steps[pos], this.upcomingRequired(now));
    }

    // Notes whose window has passed are missed.
    for (const step of this.steps) {
      if (this.due(step.time) + this.window >= now) break;
      for (const midi of step.pending) {
        step.pending.delete(midi);
        this.stats.missed++;
        this.addMistake(step.measure);
        this.cb.onJudge?.(step, midi, JUDGEMENT.MISSED, null);
      }
    }

    if (now > this.due(this.endAt) + this.window) this.endLap(now);
  }

  upcomingRequired(now) {
    const next = this.steps.find((s) => s.pending.size > 0 && this.due(s.time) + this.window >= now);
    return next ? next.pending : new Set();
  }

  handle(event) {
    if (this.finished || !this.timer || event.type !== 'noteon') return;
    const t = event.time;

    // Closest pending note with this pitch within the timing window.
    let best = null;
    for (const step of this.steps) {
      const dt = t - this.due(step.time);
      if (dt < -this.window) break;
      if (dt > this.window || !step.pending.has(event.note)) continue;
      if (!best || Math.abs(dt) < Math.abs(best.dt)) best = { step, dt };
    }

    if (best) {
      best.step.pending.delete(event.note);
      const { dt } = best;
      const judgement = Math.abs(dt) <= this.onTimeWindow ? JUDGEMENT.ON_TIME : dt < 0 ? JUDGEMENT.EARLY : JUDGEMENT.LATE;
      this.stats[judgement === JUDGEMENT.ON_TIME ? 'onTime' : judgement]++;
      this.cb.onJudge?.(best.step, event.note, judgement, dt);
      this.cb.onStep?.(this.steps[Math.max(0, this.shownStep)], this.upcomingRequired(t));
      return;
    }

    // Notes of the other hand (when practicing one hand) are fine.
    const nearby = this.steps.some((s) => Math.abs(t - this.due(s.time)) <= this.window && s.notes.some((n) => n.midi === event.note));
    if (nearby) return;

    this.stats.wrong++;
    const step = this.steps[Math.max(0, this.shownStep)];
    this.addMistake(step.measure);
    this.cb.onWrong?.(event.note, step);
  }

  addMistake(measure) {
    this.stats.mistakesByMeasure[measure] = (this.stats.mistakesByMeasure[measure] ?? 0) + 1;
  }

  endLap(now) {
    this.stats.laps++;
    const lapLength = (this.endAt - this.startAt) * this.msPerWhole;
    if (this.loop) {
      this.t0 += lapLength;
      this.cb.onLap?.(this.summary(now));
      this.beginLap();
    } else {
      this.finished = true;
      this.stop();
      this.endedAt = now;
      this.cb.onFinish?.(this.summary(now));
    }
  }

  summary(now = performance.now()) {
    const { onTime, early, late, missed, wrong, laps, mistakesByMeasure } = this.stats;
    const hits = onTime + early + late;
    const attempts = hits + missed + wrong;
    const lapMs = (this.endAt - this.startAt) * this.msPerWhole;
    const position = this.t0 === undefined ? 0 : Math.min(1, Math.max(0, (now - this.t0) / lapMs));
    return {
      mode: this.mode,
      correct: hits,
      wrong,
      onTime,
      early,
      late,
      missed,
      accuracy: attempts ? hits / attempts : 1,
      timing: hits ? onTime / hits : 1,
      laps,
      seconds: this.startedAt ? Math.max(0, ((this.endedAt ?? now) - this.startedAt) / 1000) : 0,
      progress: this.finished ? 1 : position,
      troubleMeasures: Object.entries(mistakesByMeasure)
        .sort((a, b) => b[1] - a[1])
        .map(([measure, count]) => ({ measure: Number(measure), count })),
      mistakesByMeasure,
    };
  }
}
