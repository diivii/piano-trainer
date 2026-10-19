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
      idle: 'Nicht verbunden',
      requesting: 'MIDI-Zugriff wird angefragt…',
      ready: devices.length ? 'Verbunden' : 'MIDI bereit – kein Gerät gefunden',
      denied: 'MIDI-Zugriff verweigert',
      unsupported: 'Web MIDI wird nicht unterstützt',
    };
    this.statusEl.textContent = labels[state] ?? state;
    this.statusEl.dataset.state = state === 'ready' && devices.length ? 'ok' : state === 'ready' ? 'warn' : state;
    if (error) this.statusEl.textContent += ` (${error})`;
    if (!supported) this.statusEl.title = 'Unter Windows Chrome/Edge verwenden, auf dem iPad die App „Web MIDI Browser“.';

    this.devicesEl.replaceChildren(
      ...devices.map((d) => {
        const li = document.createElement('li');
        const state = { connected: 'verbunden', disconnected: 'getrennt' }[d.state] ?? d.state;
        li.textContent = `${d.name}${d.manufacturer ? ` (${d.manufacturer})` : ''} – ${state}`;
        return li;
      }),
    );
  }

  describe(event) {
    switch (event.type) {
      case 'noteon': return `Ton an    ${noteName(event.note).padEnd(4)} #${event.note}  Stärke ${event.velocity}`;
      case 'noteoff': return `Ton aus   ${noteName(event.note).padEnd(4)} #${event.note}`;
      case 'pedal': return `Pedal     ${event.down ? 'gedrückt' : 'los'} (${event.value})`;
      case 'cc': return `CC ${event.controller}     Wert ${event.value}`;
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
    this.countsEl.textContent = `an ${c.noteon} · aus ${c.noteoff} · Pedal ${c.pedal} · CC ${c.cc}`;
  }

  clear() {
    this.logEl.replaceChildren();
    for (const k of Object.keys(this.counts)) this.counts[k] = 0;
    this.renderCounts();
  }
}
