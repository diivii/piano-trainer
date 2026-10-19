// MIDI input layer.
// Everything the rest of the app knows about the piano comes through here as
// normalized events, regardless of the source (real MIDI device, computer
// keyboard, mouse on the on-screen keyboard, or a replayed recording).
// When moving to a native shell later, only this module needs replacing.
//
// Event shape:
//   { type: 'noteon' | 'noteoff', note, velocity, time, source, device? }
//   { type: 'pedal', value, down, time, source, device? }    (CC64 sustain)
//   { type: 'cc', controller, value, time, source, device? } (other CCs)
//   { type: 'status', ... }                                  (connection changes)

export const SOURCE = {
  MIDI: 'midi',
  KEYBOARD: 'keyboard',
  MOUSE: 'mouse',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(note) {
  return NOTE_NAMES[note % 12] + (Math.floor(note / 12) - 1);
}

export class MidiInput {
  constructor() {
    this.listeners = new Set();
    this.access = null;
    this.status = { supported: 'requestMIDIAccess' in navigator, state: 'idle', error: null, devices: [] };
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  // Inject an event from any non-MIDI source (simulator, replay, tests).
  inject(event) {
    this.emit({ time: performance.now(), ...event });
  }

  async connect() {
    if (!this.status.supported) {
      this.setStatus({ state: 'unsupported', error: 'Web MIDI is not available in this browser.' });
      return;
    }
    this.setStatus({ state: 'requesting', error: null });
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.setStatus({ state: 'denied', error: err.message || String(err) });
      return;
    }
    this.access.onstatechange = () => this.refreshInputs();
    this.refreshInputs();
  }

  refreshInputs() {
    const devices = [];
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (msg) => this.handleMessage(msg, input);
      devices.push({ id: input.id, name: input.name, manufacturer: input.manufacturer, state: input.state });
    }
    this.setStatus({ state: 'ready', devices });
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    this.emit({ type: 'status', time: performance.now(), ...this.status });
  }

  handleMessage(msg, input) {
    const [statusByte, d1, d2] = msg.data;
    // Ignore system real-time messages (active sensing 0xFE, clock 0xF8, ...).
    if (statusByte >= 0xf0) return;

    // Timestamps should share performance.now()'s clock (tempo mode relies on it),
    // but some Web MIDI implementations use another base; fall back to "now" then.
    const now = performance.now();
    const time = Math.abs(msg.timeStamp - now) < 1000 ? msg.timeStamp : now;
    const base = { time, source: SOURCE.MIDI, device: input.name };
    const kind = statusByte & 0xf0;

    if (kind === 0x90 && d2 > 0) {
      this.emit({ ...base, type: 'noteon', note: d1, velocity: d2 });
    } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
      this.emit({ ...base, type: 'noteoff', note: d1, velocity: d2 ?? 0 });
    } else if (kind === 0xb0 && d1 === 64) {
      this.emit({ ...base, type: 'pedal', value: d2, down: d2 >= 64 });
    } else if (kind === 0xb0) {
      this.emit({ ...base, type: 'cc', controller: d1, value: d2 });
    }
  }
}

// Computer-keyboard simulator: two rows of the keyboard act as piano keys.
//   white keys: A S D F G H J K L ; '   -> C D E F G A B C D E F
//   black keys: W E   T Y U   O P       -> C# D#  F# G# A#  C# D#
//   Z / X: octave down / up, Space: sustain pedal, hold Shift for loud notes.
const KEY_OFFSETS = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15,
  Semicolon: 16, Quote: 17,
};

export class KeyboardSimulator {
  constructor(midiInput, { baseNote = 60, onOctaveChange } = {}) {
    this.midi = midiInput;
    this.baseNote = baseNote;
    this.onOctaveChange = onOctaveChange;
    this.held = new Map(); // key code -> note actually sent
    this.pedalDown = false;

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.releaseAll());
  }

  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onKeyDown(e) {
    if (this.isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      if (!e.repeat) this.shiftOctave(e.code === 'KeyZ' ? -12 : 12);
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && !this.pedalDown) {
        this.pedalDown = true;
        this.midi.inject({ type: 'pedal', value: 127, down: true, source: SOURCE.KEYBOARD });
      }
      return;
    }

    const offset = KEY_OFFSETS[e.code];
    if (offset === undefined) return;
    e.preventDefault();
    if (e.repeat || this.held.has(e.code)) return;

    const note = this.baseNote + offset;
    if (note < 21 || note > 108) return;
    this.held.set(e.code, note);
    this.midi.inject({ type: 'noteon', note, velocity: e.shiftKey ? 110 : 70, source: SOURCE.KEYBOARD });
  }

  onKeyUp(e) {
    if (this.isTyping(e)) return;
    if (e.code === 'Space') e.preventDefault(); // don't "click" a focused button
    if (e.code === 'Space' && this.pedalDown) {
      this.pedalDown = false;
      this.midi.inject({ type: 'pedal', value: 0, down: false, source: SOURCE.KEYBOARD });
      return;
    }
    const note = this.held.get(e.code);
    if (note === undefined) return;
    this.held.delete(e.code);
    this.midi.inject({ type: 'noteoff', note, velocity: 0, source: SOURCE.KEYBOARD });
  }

  shiftOctave(delta) {
    const next = this.baseNote + delta;
    if (next < 24 || next > 96) return;
    this.baseNote = next;
    this.onOctaveChange?.(this.baseNote);
  }

  releaseAll() {
    for (const note of this.held.values()) {
      this.midi.inject({ type: 'noteoff', note, velocity: 0, source: SOURCE.KEYBOARD });
    }
    this.held.clear();
    if (this.pedalDown) {
      this.pedalDown = false;
      this.midi.inject({ type: 'pedal', value: 0, down: false, source: SOURCE.KEYBOARD });
    }
  }
}
