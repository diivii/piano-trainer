// Metronome clicks via Web Audio, scheduled ahead of time so they stay steady.
// Times are given in performance.now() milliseconds and converted to audio time.
// iOS only allows audio after a user gesture, so call unlock() from a click/tap.

export class Metronome {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
  }

  unlock() {
    this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Schedule a click at performance-time `at` (ms). Accent = first beat of a bar.
  click(at, accent = false) {
    if (!this.ctx) return;
    const when = this.ctx.currentTime + Math.max(0, (at - performance.now()) / 1000);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(this.volume * (accent ? 1 : 0.6), when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }
}
