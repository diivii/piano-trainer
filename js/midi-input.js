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

// German note names: B is B flat, H is B natural.
const NOTE_NAMES = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];

// The list of MIDI ports comes in different shapes: a Map-like object in
// today's browsers, but Web MIDI polyfills (such as the one in the iOS "Web
// MIDI Browser" app) may give a Map without values(), a plain object, an
// array, or (old spec) a function returning an array.
//
// Their values()/keys() may also return an old-style iterator (an object with
// next() but no Symbol.iterator), which Array.from() silently reads as empty.
// So every strategy is tried until one finds ports.
export function listPorts(ports) {
  if (!ports) return [];
  if (typeof ports === 'function') return drain(ports());
  if (Array.isArray(ports)) return ports;

  const isPort = (p) => p && typeof p === 'object' && ('onmidimessage' in p || 'name' in p || 'id' in p);
  const strategies = [
    () => typeof ports.values === 'function' && drain(ports.values()),
    () => {
      if (typeof ports.forEach !== 'function') return [];
      const list = [];
      ports.forEach((a, b) => list.push(isPort(a) ? a : b)); // (value, key) or (key, value)
      return list;
    },
    () => typeof ports.entries === 'function' && drain(ports.entries()).map((e) => (isPort(e?.[1]) ? e[1] : e?.[0])),
    () => typeof ports.keys === 'function' && typeof ports.get === 'function' && drain(ports.keys()).map((k) => ports.get(k)),
    () => Object.values(ports),
  ];
  for (const strategy of strategies) {
    let found = [];
    try {
      found = (strategy() || []).filter(isPort);
    } catch {
      // try the next way
    }
    if (found.length) return found;
  }
  return [];
}

// For the diagnostics: what calling map[method]() returns.
function describeIterator(map, method) {
  try {
    if (typeof map?.[method] !== 'function') return `not a function (${typeof map?.[method]})`;
    const it = map[method]();
    const kind = Array.isArray(it) ? 'array' : typeof it;
    return `${kind}, iterable=${typeof it?.[Symbol.iterator] === 'function'}, next=${typeof it?.next === 'function'}, items=${drain(it).length}`;
  } catch (err) {
    return `throws ${err.message}`;
  }
}

function countForEach(map) {
  try {
    let n = 0;
    map?.forEach?.(() => n++);
    return n;
  } catch (err) {
    return `throws ${err.message}`;
  }
}

// Turns any iterable, old-style iterator or array-like into an array.
function drain(it) {
  if (!it) return [];
  if (Array.isArray(it)) return it;
  if (typeof it[Symbol.iterator] === 'function') return Array.from(it);
  if (typeof it.next === 'function') {
    const out = [];
    for (let r = it.next(), guard = 0; r && !r.done && guard < 1000; r = it.next(), guard++) out.push(r.value);
    return out;
  }
  if (typeof it.length === 'number') return Array.from(it);
  return [];
}

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
      this.setStatus({ state: 'unsupported', error: 'Web MIDI ist in diesem Browser nicht verfügbar.' });
      return;
    }
    this.setStatus({ state: 'requesting', error: null });
    clearInterval(this.pollTimer);
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.setStatus({ state: 'denied', error: err.message || String(err) });
      return;
    }
    this.attached = new WeakSet(); // ports we listen to
    this.seen = new WeakSet(); // message events already handled
    this.deviceKey = null;
    this.diag = { refreshes: 0, stateChanges: 0, rawMessages: 0, lastRaw: null };

    const onStateChange = () => {
      this.diag.stateChanges++;
      this.refreshInputs();
    };
    this.access.onstatechange = onStateChange;
    this.access.addEventListener?.('statechange', onStateChange);

    // Some Web MIDI polyfills fill in the device list late, or never send
    // "statechange" events, so keep checking for devices.
    this.refreshInputs(true);
    this.pollTimer = setInterval(() => this.refreshInputs(), 1500);
  }

  refreshInputs(force = false) {
    this.diag.refreshes++;
    let inputs, outputs;
    try {
      inputs = listPorts(this.access.inputs);
      outputs = listPorts(this.access.outputs);
    } catch (err) {
      this.setStatus({ state: 'denied', error: `MIDI-Geräte konnten nicht gelesen werden: ${err.message || err}` });
      return;
    }
    for (const input of inputs) this.listen(input);
    this.outputs = outputs.filter((o) => typeof o.send === 'function');

    const devices = inputs.map((p) => ({ id: p.id, name: p.name, manufacturer: p.manufacturer, state: p.state }));
    const key = JSON.stringify(devices);
    this.status.diagnostics = this.describe(inputs.length, outputs);
    if (force || key !== this.deviceKey) {
      this.deviceKey = key;
      this.setStatus({ state: 'ready', devices });
    }
  }

  // The MIDI output to play through the piano: prefer a real instrument over
  // network sessions ("Session 1" on iOS).
  pianoOutput() {
    const outputs = this.outputs ?? [];
    return outputs.find((o) => !/^session\b/i.test(o.name ?? '')) ?? outputs[0] ?? null;
  }

  listen(port) {
    if (this.attached.has(port)) return;
    this.attached.add(port);
    // Listen both ways; implementations differ in which one they support.
    // The same event object arriving twice is only handled once.
    const handler = (msg) => {
      if (msg && typeof msg === 'object') {
        if (this.seen.has(msg)) return;
        this.seen.add(msg);
      }
      this.handleMessage(msg, port);
    };
    port.onmidimessage = handler;
    port.addEventListener?.('midimessage', handler);
    try {
      port.open?.()?.catch?.(() => {});
    } catch {
      // open() is optional; setting onmidimessage opens the port too
    }
  }

  // What the browser's MIDI implementation looks like, shown in the
  // connection dialog to debug devices that don't show up.
  describe(inputCount, outputs) {
    const map = this.access?.inputs;
    const type = map === null ? 'null' : Array.isArray(map) ? 'array' : typeof map;
    const proto = map && typeof map === 'object' ? Object.getPrototypeOf(map) : null;
    const methods = proto ? Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor') : [];
    const native = String(navigator.requestMIDIAccess).includes('[native code]');
    const d = this.diag;
    return [
      `implementation: ${native ? 'built-in' : 'polyfill'}`,
      `inputs: ${type} ${proto?.constructor?.name ?? ''} size=${map?.size ?? map?.length ?? '?'}`,
      `inputs keys: ${map && typeof map === 'object' ? Object.keys(map).slice(0, 8).join(', ') || '(none)' : '-'}`,
      `inputs methods: ${methods.slice(0, 12).join(', ') || '(none)'}`,
      `values(): ${describeIterator(map, 'values')}; forEach items: ${countForEach(map)}`,
      `listed: ${inputCount} input(s), ${outputs.length} output(s)${outputs.length ? ` [${outputs.map((o) => o.name).join(', ')}]` : ''}`,
      `checks: ${d.refreshes}, statechange events: ${d.stateChanges}, raw messages: ${d.rawMessages}${d.lastRaw ? ` (last: ${d.lastRaw})` : ''}`,
      // Web MIDI Browser's add-on receives data through global _callback_* functions.
      `add-on callbacks: ${Object.keys(window).filter((k) => k.startsWith('_callback_')).join(', ') || '(none)'}`,
      `add-on callback errors: ${window.__midiCallbackErrors ?? 0}`,
    ].join('\n');
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    this.emit({ type: 'status', time: performance.now(), ...this.status });
  }

  handleMessage(msg, input) {
    if (!msg?.data) return;
    const [statusByte, d1, d2] = msg.data;
    this.diag.rawMessages++;
    this.diag.lastRaw = Array.from(msg.data, (b) => b.toString(16).padStart(2, '0')).join(' ');
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
