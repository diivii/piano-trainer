// On-screen 88-key piano (A0 = 21 to C8 = 108).
// Shows which keys are down / sustained, and doubles as mouse/touch input.

import { SOURCE } from './midi-input.js';

const FIRST_NOTE = 21;
const LAST_NOTE = 108;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const isBlack = (note) => BLACK.has(note % 12);

export class KeyboardView {
  constructor(container, midiInput) {
    this.container = container;
    this.midi = midiInput;
    this.keys = new Map(); // note -> element
    this.pointers = new Map(); // pointerId -> note
    this.render();
  }

  render() {
    const whiteCount = [...Array(LAST_NOTE - FIRST_NOTE + 1).keys()]
      .filter((i) => !isBlack(FIRST_NOTE + i)).length;
    const whiteWidth = 100 / whiteCount;

    const board = document.createElement('div');
    board.className = 'piano';

    let whiteIndex = 0;
    for (let note = FIRST_NOTE; note <= LAST_NOTE; note++) {
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
    const key = this.keys.get(note);
    if (!key) return;
    key.classList.toggle('down', state === 'down');
    key.classList.toggle('sustained', state === 'sustained');
  }

  // Notes the score expects next (shown as hints).
  setExpected(notes) {
    for (const [note, key] of this.keys) key.classList.toggle('expected', notes.has(note));
  }

  flashWrong(note) {
    const key = this.keys.get(note);
    if (!key) return;
    key.classList.add('wrong');
    clearTimeout(key.wrongTimer);
    key.wrongTimer = setTimeout(() => key.classList.remove('wrong'), 400);
  }

  setOctaveMarker(baseNote) {
    for (const [note, key] of this.keys) {
      key.classList.toggle('sim-range', note >= baseNote && note < baseNote + 18);
    }
  }
}
