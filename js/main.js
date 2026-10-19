import { MidiInput, KeyboardSimulator, noteName } from './midi-input.js';
import { KeyboardView } from './keyboard-view.js';
import { DebugPanel } from './debug-panel.js';
import { ScoreView } from './score-view.js';
import { PracticeSession } from './practice.js';

const $ = (id) => document.getElementById(id);

const midi = new MidiInput();
const keyboard = new KeyboardView($('keyboard'), midi);
const debug = new DebugPanel($('debug'));
const score = new ScoreView($('score'));

// ---- Live key display -------------------------------------------------------

// Which keys are physically down, and which are still sounding via the pedal.
const down = new Set();
const sustained = new Set();
let pedalDown = false;

function updateKeys(event) {
  switch (event.type) {
    case 'noteon':
      down.add(event.note);
      sustained.delete(event.note);
      keyboard.setKeyState(event.note, 'down');
      break;
    case 'noteoff':
      down.delete(event.note);
      if (pedalDown) {
        sustained.add(event.note);
        keyboard.setKeyState(event.note, 'sustained');
      } else {
        keyboard.setKeyState(event.note, null);
      }
      break;
    case 'pedal':
      pedalDown = event.down;
      if (!pedalDown) {
        for (const note of sustained) keyboard.setKeyState(note, null);
        sustained.clear();
      }
      break;
    default:
      return;
  }
  const notes = [...down].sort((a, b) => a - b);
  $('held').textContent = notes.length ? notes.map(noteName).join('  ') : '–';
  $('pedal').textContent = pedalDown ? 'Pedal: down' : 'Pedal: up';
  $('pedal').classList.toggle('active', pedalDown);
}

// ---- Practice -----------------------------------------------------------------

let piece = null; // { title, measureCount, steps }
let session = null;

function settings() {
  return {
    hands: $('hands').value,
    fromMeasure: Number($('from-bar').value) || 1,
    toMeasure: Number($('to-bar').value) || Infinity,
    loop: $('loop').checked,
  };
}

function startSession() {
  if (!piece) return;
  hideMessage();
  session = new PracticeSession(piece.steps, settings(), {
    onStep: (step, required) => {
      score.moveTo(step.index);
      keyboard.setExpected($('hints').checked ? required : new Set());
      renderStats();
    },
    onWrong: (note) => {
      keyboard.flashWrong(note);
      renderStats();
    },
    onLap: (summary) => {
      showMessage(`Lap ${summary.laps} done – ${formatSummary(summary)}`);
    },
    onFinish: (summary) => {
      keyboard.setExpected(new Set());
      score.hideCursor();
      renderStats();
      showMessage(`Finished! ${formatSummary(summary)}`);
    },
  });
  session.start();
  renderStats();
}

function formatSummary(s) {
  const trouble = s.troubleMeasures.slice(0, 3).map((t) => `bar ${t.measure} (${t.count})`);
  return `${Math.round(s.accuracy * 100)}% accuracy, ${s.wrong} wrong notes, ${formatTime(s.seconds)}.`
    + (trouble.length ? ` Most mistakes: ${trouble.join(', ')}.` : ' No mistakes!');
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function renderStats() {
  if (!session) return;
  const s = session.summary();
  $('stat-correct').textContent = s.correct;
  $('stat-wrong').textContent = s.wrong;
  $('stat-accuracy').textContent = s.correct + s.wrong ? `${Math.round(s.accuracy * 100)}%` : '–';
  $('stat-time').textContent = formatTime(s.seconds);
  $('stat-laps').textContent = s.laps;
  $('stat-laps-wrap').hidden = !session.loop;
  $('progress-bar').style.width = `${s.progress * 100}%`;
}

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
}

function hideMessage() {
  $('message').hidden = true;
}

async function loadPiece(content) {
  try {
    piece = await score.load(content);
  } catch (err) {
    showMessage(`Could not load this file: ${err.message || err}`);
    return;
  }
  $('piece-title').textContent = piece.title;
  for (const id of ['from-bar', 'to-bar']) $(id).max = piece.measureCount;
  $('from-bar').value = 1;
  $('to-bar').value = piece.measureCount;
  startSession();
}

$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadPiece(reader.result);
  // Compressed MusicXML (.mxl) is a zip; the library expects it as a binary string.
  if (file.name.toLowerCase().endsWith('.mxl')) reader.readAsBinaryString(file);
  else reader.readAsText(file);
  $('file').value = '';
});

$('load-sample').addEventListener('click', async () => {
  const res = await fetch('samples/ode-to-joy.musicxml');
  loadPiece(await res.text());
});

for (const id of ['hands', 'from-bar', 'to-bar', 'loop']) $(id).addEventListener('change', startSession);
$('restart').addEventListener('click', startSession);
$('hints').addEventListener('change', () => {
  if (session?.current) keyboard.setExpected($('hints').checked ? session.required(session.current) : new Set());
});

setInterval(() => session && !session.finished && renderStats(), 500);

// ---- Input --------------------------------------------------------------------

midi.on((event) => {
  debug.handle(event);
  updateKeys(event);
  session?.handle(event);
});

const simulator = new KeyboardSimulator(midi, {
  onOctaveChange: (base) => {
    $('sim-octave').textContent = `${noteName(base)}–${noteName(base + 17)}`;
    keyboard.setOctaveMarker(base);
  },
});
simulator.onOctaveChange(simulator.baseNote);

$('connect').addEventListener('click', (e) => {
  e.preventDefault(); // don't toggle the <details> panel
  midi.connect();
});
midi.connect();

// Handle for debugging from the browser console (e.g. replaying recorded input).
window.pianoTrainer = { midi, score, get piece() { return piece; }, get session() { return session; } };
