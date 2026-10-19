// MIDI debug panel: connection status, devices and a live event log.
// Meant to be readable on the iPad while sitting at the piano.

import { noteName } from './midi-input.js';

const MAX_ROWS = 200;

export class DebugPanel {
  constructor(root) {
    this.root = root;
    this.statusEl = root.querySelector('[data-status]');
    this.devicesEl = root.querySelector('[data-devices]');
    this.logEl = root.querySelector('[data-log]');
    this.countsEl = root.querySelector('[data-counts]');
    this.counts = { noteon: 0, noteoff: 0, pedal: 0, cc: 0 };
    this.startTime = performance.now();

    root.querySelector('[data-clear]').addEventListener('click', (e) => {
      e.preventDefault(); // don't toggle the collapsible panel
      this.clear();
    });
  }

  handle(event) {
    if (event.type === 'status') {
      this.showStatus(event);
      return;
    }
    this.counts[event.type] = (this.counts[event.type] ?? 0) + 1;
    this.renderCounts();
    this.addRow(event);
  }

  showStatus({ state, error, devices, supported }) {
    const labels = {
      idle: 'Not connected',
      requesting: 'Requesting MIDI access…',
      ready: devices.length ? 'Connected' : 'MIDI ready – no devices found',
      denied: 'MIDI access denied',
      unsupported: 'Web MIDI not supported',
    };
    this.statusEl.textContent = labels[state] ?? state;
    this.statusEl.dataset.state = state === 'ready' && devices.length ? 'ok' : state === 'ready' ? 'warn' : state;
    if (error) this.statusEl.textContent += ` (${error})`;
    if (!supported) this.statusEl.title = 'Use Chrome/Edge on Windows, or the Web MIDI Browser app on iPad.';

    this.devicesEl.replaceChildren(
      ...devices.map((d) => {
        const li = document.createElement('li');
        li.textContent = `${d.name}${d.manufacturer ? ` (${d.manufacturer})` : ''} – ${d.state}`;
        return li;
      }),
    );
  }

  describe(event) {
    switch (event.type) {
      case 'noteon': return `Note ON   ${noteName(event.note).padEnd(4)} #${event.note}  vel ${event.velocity}`;
      case 'noteoff': return `Note OFF  ${noteName(event.note).padEnd(4)} #${event.note}`;
      case 'pedal': return `Pedal     ${event.down ? 'down' : 'up'} (${event.value})`;
      case 'cc': return `CC ${event.controller}     value ${event.value}`;
      default: return event.type;
    }
  }

  addRow(event) {
    const row = document.createElement('div');
    row.className = `row ${event.type}`;
    const t = ((event.time - this.startTime) / 1000).toFixed(3).padStart(8);
    row.textContent = `${t}s  ${event.source.padEnd(8)}  ${this.describe(event)}`;
    this.logEl.prepend(row);
    while (this.logEl.childElementCount > MAX_ROWS) this.logEl.lastChild.remove();
  }

  renderCounts() {
    const c = this.counts;
    this.countsEl.textContent = `on ${c.noteon} · off ${c.noteoff} · pedal ${c.pedal} · cc ${c.cc}`;
  }

  clear() {
    this.logEl.replaceChildren();
    for (const k of Object.keys(this.counts)) this.counts[k] = 0;
    this.renderCounts();
  }
}
