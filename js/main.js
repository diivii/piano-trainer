import { MidiInput, KeyboardSimulator, noteName } from './midi-input.js';
import { KeyboardView } from './keyboard-view.js';
import { DebugPanel } from './debug-panel.js';
import { ScoreView, NOTE_COLOR } from './score-view.js';
import { PracticeSession } from './practice.js';
import { TempoSession, JUDGEMENT } from './tempo-practice.js';
import { Metronome } from './metronome.js';
import { Player } from './player.js';
import { renderLibrary } from './library-view.js';
import { saveBackup, restoreBackup, lastBackup } from './backup.js';
import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);

const midi = new MidiInput();
const keyboard = new KeyboardView($('keyboard'), midi);
const debug = new DebugPanel($('debug'));
const score = new ScoreView($('score'));
const metronome = new Metronome();
const player = new Player();
const settings = storage.loadSettings();

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
  $('now-playing').textContent = notes.map(noteName).join(' ') + (pedalDown ? '  · Pedal' : '');
  $('now-playing').hidden = !notes.length && !pedalDown;
}

function updateMidiPill({ state, devices }) {
  const pill = $('midi-pill');
  const label = pill.querySelector('[data-pill-label]');
  if (devices?.length) {
    pill.dataset.state = 'on';
    label.textContent = devices.map((d) => d.name).join(', ');
  } else if (state === 'denied' || state === 'unsupported') {
    pill.dataset.state = 'error';
    label.textContent = 'MIDI nicht verfügbar';
  } else {
    pill.dataset.state = 'off';
    label.textContent = 'Kein Klavier';
  }
}

// ---- Settings controls --------------------------------------------------------

function syncControls() {
  for (const group of document.querySelectorAll('.segmented')) {
    for (const button of group.children) {
      button.classList.toggle('active', button.dataset.value === settings[group.dataset.setting]);
    }
  }
  for (const toggle of document.querySelectorAll('[data-toggle]')) {
    toggle.classList.toggle('active', Boolean(settings[toggle.dataset.toggle]));
  }
  $('tempo').value = settings.tempo;
  $('practice-view').classList.toggle('mode-tempo', settings.mode === 'tempo');
  keyboard.setStrip(settings.keyboard === 'strip');
  renderSettingsSummary();
}

// Settings that only change the display; everything else restarts the run.
const DISPLAY_ONLY = new Set(['hints', 'zoom', 'keyboard', 'sound']);

function setSetting(key, value) {
  settings[key] = value;
  storage.saveSettings(settings);
  syncControls();
  if (key === 'hints') updateHints();
  if (!DISPLAY_ONLY.has(key)) startSession();
}

// "⚙ Takte 3–4 · Wiederholen" on the settings button, so the active section is always visible.
function renderSettingsSummary() {
  if (!piece) return;
  const { from, to } = currentSection();
  const whole = from === 1 && to === piece.measureCount;
  const bars = whole ? 'Ganzes Stück' : from === to ? `Takt ${from}` : `Takte ${from}–${to}`;
  $('settings-summary').textContent = bars + (settings.loop ? ' · Wiederholen' : '');
}

// ---- Settings popover ----

$('settings-open').addEventListener('click', (e) => {
  e.stopPropagation();
  $('settings-panel').hidden = !$('settings-panel').hidden;
});
$('settings-panel').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => ($('settings-panel').hidden = true));

$('keyboard-toggle').addEventListener('click', () =>
  setSetting('keyboard', settings.keyboard === 'strip' ? 'normal' : 'strip'));

// ---- Section (bar range) ----

function currentSection() {
  const max = piece?.measureCount ?? 1;
  const clamp = (n, fallback) => Math.min(max, Math.max(1, Math.round(n) || fallback));
  let from = clamp(Number($('from-bar').value), 1);
  let to = clamp(Number($('to-bar').value), max);
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function setSection(from, to, { loop } = {}) {
  $('from-bar').value = from;
  $('to-bar').value = to;
  if (loop !== undefined && loop !== settings.loop) {
    settings.loop = loop;
    storage.saveSettings(settings);
    syncControls();
  }
  applySection();
}

function applySection() {
  const { from, to } = currentSection();
  $('from-bar').value = from;
  $('to-bar').value = to;
  const whole = from === 1 && to === piece.measureCount;
  score.setSection(whole ? null : { from, to });
  hideSectionChip();
  renderSettingsSummary();
  startSession();
}

for (const id of ['from-bar', 'to-bar']) $(id).addEventListener('change', applySection);
$('whole-piece').addEventListener('click', () => setSection(1, piece.measureCount, { loop: false }));

// Tapping bars in the music: first tap starts there, a second tap picks the
// end of a section to loop. A tap while a section is set starts a new one.
let pendingStart = null;

$('score').addEventListener('click', (e) => {
  if (!piece || e.target.closest('button') || !$('settings-panel').hidden) return;
  const bar = score.measureAt(e.clientX, e.clientY);
  if (bar === null) return;

  if (pendingStart === null) {
    pendingStart = bar;
    $('from-bar').value = bar;
    $('to-bar').value = piece.measureCount;
    score.setSection({ from: bar, to: bar, pending: true });
    showSectionChip(bar);
    renderSettingsSummary();
    startSession();
  } else {
    const [from, to] = [Math.min(pendingStart, bar), Math.max(pendingStart, bar)];
    pendingStart = null;
    setSection(from, to, { loop: true });
  }
});

function showSectionChip(bar) {
  const chip = $('section-chip');
  chip.replaceChildren(`Start bei Takt ${bar}. Tippe auf einen weiteren Takt, um einen Abschnitt zu wiederholen.`);
  const whole = document.createElement('button');
  whole.type = 'button';
  whole.textContent = 'Ganzes Stück';
  whole.addEventListener('click', (e) => {
    e.stopPropagation();
    pendingStart = null;
    setSection(1, piece.measureCount, { loop: false });
  });
  chip.append(whole);
  chip.hidden = false;
}

function hideSectionChip() {
  pendingStart = null;
  $('section-chip').hidden = true;
}

for (const group of document.querySelectorAll('.segmented')) {
  group.addEventListener('click', (e) => {
    const value = e.target.closest('button')?.dataset.value;
    if (value && value !== settings[group.dataset.setting]) setSetting(group.dataset.setting, value);
  });
}
for (const toggle of document.querySelectorAll('[data-toggle]')) {
  toggle.addEventListener('click', () => setSetting(toggle.dataset.toggle, !settings[toggle.dataset.toggle]));
}

const clampTempo = (bpm) => Math.min(240, Math.max(20, Math.round(bpm) || 60));
$('tempo').addEventListener('change', () => setSetting('tempo', clampTempo(Number($('tempo').value))));
$('tempo-down').addEventListener('click', () => setSetting('tempo', clampTempo(settings.tempo - 5)));
$('tempo-up').addEventListener('click', () => setSetting('tempo', clampTempo(settings.tempo + 5)));
$('zoom-in').addEventListener('click', () => changeZoom(0.1));
$('zoom-out').addEventListener('click', () => changeZoom(-0.1));
function changeZoom(delta) {
  score.setZoom(score.zoom + delta);
  setSetting('zoom', score.zoom);
}

$('focus').addEventListener('click', () => document.body.classList.add('focus'));
$('focus-exit').addEventListener('click', () => document.body.classList.remove('focus'));

// Buttons shouldn't keep focus: Space is the simulator's pedal.
document.addEventListener('click', (e) => e.target.closest('button')?.blur());

// ---- Library ------------------------------------------------------------------

let pieceRecord = null; // stored piece { id, title, content, ... }
let piece = null; // loaded score { title, measureCount, tempo, measures, steps }

async function showLibrary() {
  endSession();
  document.body.classList.remove('focus');
  $('practice-view').hidden = true;
  $('library-view').hidden = false;
  $('back').hidden = true;
  $('app-title').textContent = 'Klaviertrainer';
  pieceRecord = null;
  piece = null;

  const pieces = await storage.listPieces();
  const items = await Promise.all(pieces.map(async (p) => ({ piece: p, stats: await storage.pieceStats(p.id) })));
  renderLibrary($('library'), items, {
    onOpen: async (id) => openRecord(await storage.getPiece(id)),
    onDelete: async (p) => {
      await storage.deletePiece(p.id);
      showLibrary();
    },
  });

  // Nudge towards a backup once there's practice history worth keeping.
  const practiced = items.some((i) => i.stats);
  const last = lastBackup();
  const stale = !last || Date.now() - last > 14 * 86400000;
  $('backup-reminder').hidden = !(practiced && stale);
  $('backup-reminder').textContent = last
    ? `Letzte Sicherung am ${formatDate(last)}. Zeit für eine neue: tippe auf „Sicherung“.`
    : 'Dein Fortschritt ist noch nicht gesichert. Tippe auf „Sicherung“, um eine Kopie zu speichern.';
}

// ---- Backup -------------------------------------------------------------------

const formatDate = (t) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function backupStatus(text) {
  $('backup-status').textContent = text;
  $('backup-status').hidden = false;
}

$('backup-open').addEventListener('click', () => {
  const last = lastBackup();
  $('backup-last').textContent = last ? formatDate(last) : 'nie';
  $('backup-status').hidden = true;
  $('backup-dialog').showModal();
});
$('backup-close').addEventListener('click', () => $('backup-dialog').close());

$('backup-export').addEventListener('click', async () => {
  try {
    const result = await saveBackup();
    if (!result) return;
    const what = `${result.pieces} Stücken und ${result.runs} Übungsdurchgängen`;
    backupStatus({
      shared: `Sicherung mit ${what} gespeichert.`,
      downloaded: `Sicherung mit ${what} heruntergeladen.`,
      copied: `Dateien speichern geht hier nicht, daher wurde die Sicherung (mit ${what}) in die Zwischenablage kopiert. Füge sie in eine Notiz ein, um sie aufzubewahren; „Aus Zwischenablage wiederherstellen“ liest sie wieder ein.`,
    }[result.how]);
    $('backup-last').textContent = formatDate(Date.now());
    showLibrary();
  } catch (err) {
    backupStatus(`Sicherung fehlgeschlagen: ${err.message || err}`);
  }
});

async function restore(source) {
  try {
    const { pieces, runs } = await restoreBackup(source);
    backupStatus(`${pieces} Stücke und ${runs} neue Übungsdurchgänge wiederhergestellt.`);
    showLibrary();
  } catch (err) {
    backupStatus(`Wiederherstellen fehlgeschlagen: ${err.message || err}`);
  }
}

$('backup-file').addEventListener('change', () => {
  const file = $('backup-file').files[0];
  $('backup-file').value = '';
  if (file) restore(file);
});

$('backup-paste').addEventListener('click', async () => {
  try {
    restore(await navigator.clipboard.readText());
  } catch (err) {
    backupStatus(`Zwischenablage konnte nicht gelesen werden: ${err.message || err}`);
  }
});

async function openRecord(record) {
  // The score must be visible while rendering, or it gets laid out at zero width.
  $('library-view').hidden = true;
  $('practice-view').hidden = false;
  $('back').hidden = false;
  $('app-title').textContent = record.title || 'Wird geladen…';
  hideMessage();

  try {
    piece = await score.load(record.content);
  } catch (err) {
    piece = null;
    showMessage(`Dieses Stück konnte nicht geladen werden: ${err.message || err}`, [{ label: 'Zurück zur Bibliothek', action: showLibrary }]);
    return false;
  }
  pieceRecord = record;
  for (const id of ['from-bar', 'to-bar']) $(id).max = piece.measureCount;
  $('from-bar').value = 1;
  $('to-bar').value = piece.measureCount;
  $('score-tempo').textContent = `(Noten: ${piece.tempo})`;
  hideSectionChip();
  renderSettingsSummary();

  // Only show the part of the keyboard this piece uses, so the keys are bigger.
  const pitches = piece.steps.flatMap((s) => s.notes.map((n) => n.midi));
  if (pitches.length) keyboard.setRange(Math.min(...pitches), Math.max(...pitches));

  startSession();
  return true;
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const record = {
      id: newId(),
      title: file.name.replace(/\.(musicxml|xml|mxl)$/i, ''),
      content: reader.result,
      addedAt: Date.now(),
    };
    if (!(await openRecord(record))) return;
    if (piece.title !== 'Untitled') record.title = piece.title;
    record.composer = piece.composer;
    $('app-title').textContent = record.title;
    await storage.savePiece(record);
  };
  // Compressed MusicXML (.mxl) is a zip; the library expects it as a binary string.
  if (file.name.toLowerCase().endsWith('.mxl')) reader.readAsBinaryString(file);
  else reader.readAsText(file);
  $('file').value = '';
});

$('back').addEventListener('click', showLibrary);

// Built-in sample pieces (samples/index.json) are each added once, so they can
// be deleted like any other piece and new samples still show up later.
async function ensureSamples() {
  const key = 'piano-trainer.samples-added';
  const added = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  if (localStorage.getItem('piano-trainer.sample-added')) added.add('sample-ode-to-joy'); // older versions

  let index;
  try {
    index = await (await fetch('samples/index.json', { cache: 'no-cache' })).json();
  } catch {
    return; // offline: try again next time
  }
  // Listed easiest first; the library shows the newest first, so count down.
  const now = Date.now();
  for (const [i, sample] of index.entries()) {
    if (added.has(sample.id)) {
      // Keep built-in pieces up to date (e.g. translated titles), unless deleted.
      const stored = await storage.getPiece(sample.id);
      if (stored?.builtIn && (stored.title !== sample.title || stored.composer !== sample.composer)) {
        const content = await (await fetch(`samples/${sample.file}`, { cache: 'no-cache' })).text();
        await storage.savePiece({ ...stored, title: sample.title, composer: sample.composer, content });
      }
      continue;
    }
    const content = await (await fetch(`samples/${sample.file}`, { cache: 'no-cache' })).text();
    await storage.savePiece({
      id: sample.id,
      title: sample.title,
      composer: sample.composer,
      content,
      addedAt: now - i,
      builtIn: true,
    });
    added.add(sample.id);
  }
  localStorage.setItem(key, JSON.stringify([...added]));
}

// ---- Practice -----------------------------------------------------------------

let session = null;
let expected = new Set(); // notes the score wants next
const stepMistakes = new Set(); // wait mode: steps where a wrong note was played
let timers = [];

function practiceOptions() {
  const { from, to } = currentSection();
  return {
    hands: settings.hands,
    fromMeasure: from,
    toMeasure: to,
    fullPiece: from <= 1 && to >= piece.measureCount,
    loop: settings.loop,
    tempo: settings.tempo,
    metronome: settings.metronome,
  };
}

function endSession() {
  stopListening({ resume: false });
  if (!session) return;
  session.stop();
  // Looping sessions never "finish"; keep their result when leaving.
  if (!session.finished && session.summary().laps > 0) recordRun(session.summary());
  session = null;
  timers.forEach(clearTimeout);
  timers = [];
  $('feedback').hidden = true;
}

function startSession() {
  endSession();
  if (!piece) return;
  hideMessage();
  $('results').hidden = true;
  score.clearColors();
  stepMistakes.clear();
  expected = new Set();
  updateHints();

  const options = practiceOptions();
  const callbacks = {
    onStep: (step, required) => {
      score.moveTo(step.index);
      expected = required;
      updateHints();
      renderStats();
    },
    onCorrect: (note, step) => {
      score.colorNote(step.index, note, stepMistakes.has(step.index) ? NOTE_COLOR.OK : NOTE_COLOR.GOOD);
    },
    onWrong: (note, step) => {
      keyboard.flashWrong(note);
      if (session.mode === 'wait') {
        stepMistakes.add(step.index);
        for (const n of session.required(step)) {
          if (!session.hit.has(n)) score.colorNote(step.index, n, NOTE_COLOR.BAD);
        }
      } else {
        flash('wrong', 'Falscher Ton');
      }
      renderStats();
    },
    onJudge: (step, note, judgement, dt) => {
      const color = { [JUDGEMENT.ON_TIME]: NOTE_COLOR.GOOD, [JUDGEMENT.MISSED]: NOTE_COLOR.BAD }[judgement] ?? NOTE_COLOR.OK;
      score.colorNote(step.index, note, color);
      const labels = { [JUDGEMENT.ON_TIME]: 'Im Takt', [JUDGEMENT.EARLY]: 'Zu früh', [JUDGEMENT.LATE]: 'Zu spät', [JUDGEMENT.MISSED]: 'Verpasst' };
      flash(judgement, dt === null ? labels[judgement] : `${labels[judgement]} ${dt > 0 ? '+' : ''}${Math.round(dt)} ms`);
      renderStats();
    },
    onCountIn: (beats, beatMs, t0) => {
      for (let b = 0; b < beats; b++) {
        const at = t0 - (beats - b) * beatMs - performance.now();
        timers.push(setTimeout(() => flash('count', String(b + 1), beatMs * 0.9), at));
      }
    },
    onLap: (summary) => {
      score.clearColors();
      stepMistakes.clear();
      showMessage(`Runde ${summary.laps}: ${formatSummary(summary)}`);
      timers.push(setTimeout(hideMessage, 3000));
    },
    onFinish: async (summary) => {
      expected = new Set();
      updateHints();
      score.hideCursor();
      renderStats();
      const options = session.options;
      const previousBest = await bestAccuracy(options, summary.mode);
      await recordRun(summary);
      showResults(summary, options, previousBest);
    },
  };

  if (settings.mode === 'tempo') {
    session = new TempoSession(piece, options, callbacks, metronome);
    score.moveTo(session.steps[0]?.index ?? 0);
    $('restart').textContent = 'Start';
    showMessage(`Tempo-Modus mit ${settings.tempo} BPM: Tippe auf Start und spiele nach dem Einzählen mit.`, [
      { label: 'Start', primary: true, action: beginTempo },
    ]);
  } else {
    session = new PracticeSession(piece.steps, options, callbacks);
    $('restart').textContent = 'Neustart';
    session.start();
  }
  session.options = options;
  renderStats();
}

function beginTempo() {
  if (!session || session.mode !== 'tempo') return;
  metronome.unlock(); // must happen inside the tap for iOS to allow sound
  hideMessage();
  $('restart').textContent = 'Neustart';
  session.start();
}

function restart() {
  if (session?.mode === 'tempo' && !session.timer && !session.finished && session.startedAt === undefined) {
    beginTempo();
    return;
  }
  startSession();
  if (settings.mode === 'tempo') beginTempo();
}

$('restart').addEventListener('click', restart);
$('focus-restart').addEventListener('click', restart);

// ---- Listening: play the piece (or the selected bars / hand) once ----

function startListening() {
  if (!piece) return;
  endSession(); // no judging while the piece plays
  hideMessage();
  $('results').hidden = true;
  player.unlock(); // inside the tap, so iOS allows sound

  let output = null;
  if (settings.sound === 'piano') {
    output = midi.pianoOutput();
    if (!output) flash('info', 'Kein Klavier verbunden – Wiedergabe über das iPad', 2500);
  }

  const { from, to } = currentSection();
  score.clearColors();
  player.play(piece, { hands: settings.hands, fromMeasure: from, toMeasure: to, tempo: settings.tempo }, output, {
    onStep: (step) => score.moveTo(step.index),
    onNotes: (notes) => keyboard.setPlaying(notes),
    onEnd: () => stopListening(),
  });
  $('listen').textContent = '■ Stopp';
  $('listen').classList.add('active');
  $('focus-listen').textContent = '■';
}

// resume: start a practice run again afterwards (not when leaving the piece).
function stopListening({ resume = true } = {}) {
  const wasActive = $('listen').classList.contains('active');
  player.stop();
  keyboard.setPlaying(new Set());
  $('listen').textContent = '▶ Anhören';
  $('listen').classList.remove('active');
  $('focus-listen').textContent = '▶';
  if (wasActive && resume) startSession();
}

for (const id of ['listen', 'focus-listen']) {
  $(id).addEventListener('click', () => (player.playing ? stopListening() : startListening()));
}

function updateHints() {
  keyboard.setExpected(settings.hints ? expected : new Set());
}

async function recordRun(summary) {
  if (!pieceRecord || !session || summary.correct + summary.wrong + (summary.missed ?? 0) === 0) return;
  const o = session.options;
  await storage.saveRun({
    pieceId: pieceRecord.id,
    date: Date.now(),
    mode: summary.mode,
    hands: o.hands,
    fromMeasure: o.fromMeasure,
    toMeasure: o.toMeasure,
    fullPiece: o.fullPiece,
    accuracy: summary.accuracy,
    wrong: summary.wrong,
    seconds: summary.seconds,
    laps: summary.laps,
    completed: true,
    mistakesByMeasure: summary.mistakesByMeasure,
    tempo: summary.mode === 'tempo' ? o.tempo : null,
  });
}

// Best accuracy of earlier completed runs with the same mode, hands and bars.
async function bestAccuracy(options, mode) {
  if (!pieceRecord) return null;
  const runs = (await storage.listRuns(pieceRecord.id)).filter((r) =>
    r.completed && r.mode === mode && r.hands === options.hands
    && r.fromMeasure === options.fromMeasure && r.toMeasure === options.toMeasure);
  return runs.length ? Math.max(...runs.map((r) => r.accuracy)) : null;
}

// ---- Results card ----

function showResults(summary, options, previousBest) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, action, primary = false) => {
    const b = el('button', primary ? 'primary' : '', label);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  };

  const pct = (x) => `${Math.round(x * 100)}%`;
  const { fromMeasure: from, toMeasure: to } = options;
  const section = options.fullPiece ? 'Ganzes Stück' : from === to ? `Takt ${from}` : `Takte ${from}–${to}`;
  const hands = { both: 'beide Hände', right: 'rechte Hand', left: 'linke Hand' }[options.hands];
  const mode = summary.mode === 'tempo' ? ` · ${options.tempo} BPM` : '';

  const card = $('results');
  card.replaceChildren();
  card.append(el('div', 'results-head', `${section} · ${hands}${mode}`));

  const big = el('div', 'results-big', pct(summary.accuracy));
  big.append(el('small', '', ' richtig'));
  card.append(big);

  let compare;
  if (previousBest === null) compare = ['', 'Erster Durchgang mit diesen Einstellungen'];
  else if (summary.accuracy > previousBest) compare = ['up', `Neue Bestleistung! Bisher: ${pct(previousBest)}`];
  else if (summary.accuracy === previousBest) compare = ['', `So gut wie deine Bestleistung (${pct(previousBest)})`];
  else compare = ['', `Deine Bestleistung: ${pct(previousBest)}`];
  card.append(el('div', `results-compare ${compare[0]}`, compare[1]));

  const details = [`Zeit ${formatTime(summary.seconds)}`, `${summary.wrong} ${summary.wrong === 1 ? 'falscher Ton' : 'falsche Töne'}`];
  if (summary.mode === 'tempo') details.push(`${summary.missed} verpasst`, `${pct(summary.timing)} im Takt`);
  card.append(el('div', 'results-details', details.join(' · ')));

  const trouble = summary.troubleMeasures.slice(0, 3);
  if (trouble.length) {
    const row = el('div', 'results-trouble');
    row.append(el('span', '', 'Üben:'));
    for (const t of trouble) {
      row.append(button(`Takt ${t.measure} →`, () => setSection(t.measure, t.measure, { loop: true })));
    }
    card.append(row);
  } else {
    card.append(el('div', 'results-details', 'Keine Fehler, super gemacht!'));
  }

  const actions = el('div', 'actions');
  actions.append(button('Nochmal', restart, true), button('Bibliothek', showLibrary));
  card.append(actions);
  card.hidden = false;
}

// ---- Stats & messages ---------------------------------------------------------

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatSummary(s) {
  const trouble = s.troubleMeasures.slice(0, 3).map((t) => `Takt ${t.measure}`);
  const timing = s.mode === 'tempo' ? ` ${Math.round(s.timing * 100)} % im Takt.` : '';
  return `${Math.round(s.accuracy * 100)} % richtig, ${s.wrong} ${s.wrong === 1 ? 'falscher Ton' : 'falsche Töne'}${s.mode === 'tempo' ? `, ${s.missed} verpasst` : ''}, ${formatTime(s.seconds)}.${timing}`
    + (trouble.length ? ` Üben: ${trouble.join(', ')}.` : ' Keine Fehler!');
}

function renderStats() {
  if (!session) return;
  const s = session.summary();
  const items = s.mode === 'tempo'
    ? [['good', 'Im Takt', s.onTime], ['meh', 'Früh', s.early], ['meh', 'Spät', s.late], ['bad', 'Verpasst', s.missed], ['bad', 'Falsch', s.wrong]]
    : [['good', '✓', s.correct], ['bad', '✗', s.wrong], ['', 'Genauigkeit', s.correct + s.wrong ? `${Math.round(s.accuracy * 100)}%` : '–']];
  items.push(['', 'Zeit', formatTime(s.seconds)]);
  if (session.loop) items.push(['', 'Runden', s.laps]);

  $('stats').replaceChildren(
    ...items.map(([cls, label, value]) => {
      const span = document.createElement('span');
      span.className = cls;
      span.append(`${label} `);
      const b = document.createElement('b');
      b.textContent = value;
      span.append(b);
      return span;
    }),
  );
  $('progress-bar').style.width = `${s.progress * 100}%`;
}

setInterval(() => session && !session.finished && renderStats(), 250);

function flash(kind, text, ms = 700) {
  const box = $('feedback');
  box.className = `feedback ${kind}`;
  box.textContent = text;
  box.hidden = false;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (box.hidden = true), ms);
}

function showMessage(text, actions = []) {
  const box = $('message');
  const p = document.createElement('div');
  p.textContent = text;
  box.replaceChildren(p);
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'actions';
    for (const { label, primary, action } of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (primary) button.className = 'primary';
      button.addEventListener('click', action);
      row.append(button);
    }
    box.append(row);
  }
  box.hidden = false;
}

function hideMessage() {
  $('message').hidden = true;
}

// ---- Input --------------------------------------------------------------------

midi.on((event) => {
  if (event.type === 'status') updateMidiPill(event);
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

$('midi-pill').addEventListener('click', () => $('midi-dialog').showModal());
setInterval(() => {
  if (!$('midi-dialog').open) return;
  $('midi-diagnostics').textContent = `App-Version: ${window.appVersion ?? '?'}\n${midi.status.diagnostics ?? 'Noch kein MIDI-Zugriff.'}`;
}, 500);
$('midi-close').addEventListener('click', () => $('midi-dialog').close());
$('connect').addEventListener('click', () => midi.connect());

// ---- Start --------------------------------------------------------------------

// Handle for debugging from the browser console (e.g. replaying recorded input).
window.pianoTrainer = {
  midi, score, storage, settings,
  get piece() { return piece; },
  get session() { return session; },
};

syncControls();
score.setZoom(settings.zoom);
midi.connect();
storage.requestPersistence();
await ensureSamples();
await showLibrary();
