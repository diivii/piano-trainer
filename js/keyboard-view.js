// On-screen piano. Shows which keys are down / sustained / expected next, and
// doubles as mouse/touch input. Can be limited to the range a piece uses
// (bigger keys) and shrunk to a thin strip so the sheet music gets more room.

import { SOURCE } from './midi-input.js';

const PIANO_LOW = 21; // A0
const PIANO_HIGH = 108; // C8
const MIN_SPAN = 24; // show at least two octaves
const BLACK = new Set([1, 3, 6, 8, 10]);

export const isBlack = (note) => BLACK.has(note % 12);

export class KeyboardView {
  constructor(container, midiInput) {
    this.container = container;
    this.midi = midiInput;
    this.low = PIANO_LOW;
    this.high = PIANO_HIGH;
    this.keys = new Map(); // note -> element
    this.pointers = new Map(); // pointerId -> note
    // Kept outside the DOM so it survives re-rendering a different range.
    this.states = new Map(); // note -> 'down' | 'sustained'
    this.expected = new Set();
    this.simBase = null;
    this.render();
  }

  // Show only the notes between low and high (padded, snapped to whole octaves
  // from C to B); without arguments the full 88 keys.
  setRange(low = PIANO_LOW, high = PIANO_HIGH) {
    if (low === PIANO_LOW && high === PIANO_HIGH) {
      this.low = PIANO_LOW;
      this.high = PIANO_HIGH;
    } else {
      let lo = Math.max(PIANO_LOW, low - 2);
      let hi = Math.min(PIANO_HIGH, high + 2);
      lo -= lo % 12; // down to a C
      hi += 11 - (hi % 12); // up to a B
      while (hi - lo + 1 < MIN_SPAN) {
        if (hi + 12 <= PIANO_HIGH + 11) hi += 12;
        if (hi - lo + 1 < MIN_SPAN && lo - 12 >= PIANO_LOW - 11) lo -= 12;
      }
      this.low = Math.max(PIANO_LOW, lo);
      this.high = Math.min(PIANO_HIGH, hi);
    }
    this.render();
  }

  setStrip(strip) {
    this.container.classList.toggle('strip', strip);
  }

  render() {
    const notes = [];
    for (let n = this.low; n <= this.high; n++) notes.push(n);
    const whiteWidth = 100 / notes.filter((n) => !isBlack(n)).length;

    const board = document.createElement('div');
    board.className = 'piano';
    this.keys.clear();

    let whiteIndex = 0;
    for (const note of notes) {
      const key = document.createElement('div');
      key.dataset.note = note;
      if (isBlack(note)) {
        key.className = 'key black';
        key.style.left = `${whiteIndex * whiteWidth - whiteWidth * 0.3}%`;
        key.style.width = `${whiteWidth * 0.6}%`;
      } else {
        key.className = 'key white';
        key.style.left = `${whiteIndex * whiteWidth}%`;
        key.style.width = `${whiteWidth}%`;
        if (note % 12 === 0) {
          const label = document.createElement('span');
          label.className = 'label';
          label.textContent = `C${note / 12 - 1}`;
          key.appendChild(label);
        }
        whiteIndex++;
      }
      this.keys.set(note, key);
      board.appendChild(key);
    }

    board.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    board.addEventListener('pointermove', (e) => this.onPointerMove(e));
    for (const type of ['pointerup', 'pointercancel']) {
      board.addEventListener(type, (e) => this.release(e.pointerId));
    }

    this.container.replaceChildren(board);
    for (const [note, state] of this.states) this.applyState(note, state);
    this.setExpected(this.expected);
    if (this.simBase !== null) this.setOctaveMarker(this.simBase);
  }

  noteAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('.key');
    return el ? Number(el.dataset.note) : null;
  }

  onPointerDown(e) {
    const note = this.noteAt(e.clientX, e.clientY);
    if (note === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    this.press(e.pointerId, note);
  }

  // Sliding across keys while pressed plays each key in turn (glissando).
  onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const note = this.noteAt(e.clientX, e.clientY);
    if (note === null || note === this.pointers.get(e.pointerId)) return;
    this.release(e.pointerId);
    this.press(e.pointerId, note);
  }

  press(pointerId, note) {
    this.pointers.set(pointerId, note);
    this.midi.inject({ type: 'noteon', note, velocity: 70, source: SOURCE.MOUSE });
  }

  release(pointerId) {
    const note = this.pointers.get(pointerId);
    if (note === undefined) return;
    this.pointers.delete(pointerId);
    this.midi.inject({ type: 'noteoff', note, velocity: 0, source: SOURCE.MOUSE });
  }

  // state: 'down' | 'sustained' | null
  setKeyState(note, state) {
    if (state) this.states.set(note, state);
    else this.states.delete(note);
    this.applyState(note, state);
  }

  applyState(note, state) {
    const key = this.keys.get(note);
    if (!key) return;
    key.classList.toggle('down', state === 'down');
    key.classList.toggle('sustained', state === 'sustained');
  }

  // Notes the score expects next (shown as hints).
  setExpected(notes) {
    this.expected = new Set(notes);
    for (const [note, key] of this.keys) key.classList.toggle('expected', this.expected.has(note));
  }

  flashWrong(note) {
    const key = this.keys.get(note);
    if (!key) return;
    key.classList.add('wrong');
    clearTimeout(key.wrongTimer);
    key.wrongTimer = setTimeout(() => key.classList.remove('wrong'), 400);
  }

  setOctaveMarker(baseNote) {
    this.simBase = baseNote;
    for (const [note, key] of this.keys) {
      key.classList.toggle('sim-range', note >= baseNote && note < baseNote + 18);
    }
  }
}
