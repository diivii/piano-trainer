// Persistence on the device: imported pieces and practice history in IndexedDB
// (scores can be too large for localStorage), small settings in localStorage.
// Everything is plain JSON so it can be exported/imported later.

const DB_NAME = 'piano-trainer';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('pieces', { keyPath: 'id' });
      const runs = db.createObjectStore('runs', { keyPath: 'id', autoIncrement: true });
      runs.createIndex('pieceId', 'pieceId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

// ---- Pieces -------------------------------------------------------------------
// { id, title, content (MusicXML text or .mxl binary string), addedAt, builtIn? }

export const savePiece = (piece) => tx('pieces', 'readwrite', (s) => s.put(piece));
export const getPiece = (id) => tx('pieces', 'readonly', (s) => s.get(id));

export async function listPieces() {
  const pieces = await tx('pieces', 'readonly', (s) => s.getAll());
  return pieces.sort((a, b) => b.addedAt - a.addedAt);
}

export async function deletePiece(id) {
  await tx('pieces', 'readwrite', (s) => s.delete(id));
  const runs = await listRuns(id);
  await tx('runs', 'readwrite', (s) => runs.forEach((r) => s.delete(r.id)));
}

// ---- Practice runs ------------------------------------------------------------
// { pieceId, date, mode, hands, fromMeasure, toMeasure, fullPiece, accuracy, wrong,
//   seconds, laps, completed, mistakesByMeasure, tempo }

export const saveRun = (run) => tx('runs', 'readwrite', (s) => s.add(run));

export const listRuns = (pieceId) =>
  tx('runs', 'readonly', (s) => s.index('pieceId').getAll(pieceId));

// Summary per piece for the library list.
export async function pieceStats(pieceId) {
  const runs = await listRuns(pieceId);
  if (!runs.length) return null;
  const mistakes = {};
  for (const run of runs.slice(-10)) {
    for (const [m, n] of Object.entries(run.mistakesByMeasure ?? {})) mistakes[m] = (mistakes[m] ?? 0) + n;
  }
  const full = runs.filter((r) => r.completed && r.fullPiece && r.hands === 'both');
  return {
    runs: runs.length,
    lastPracticed: Math.max(...runs.map((r) => r.date)),
    bestAccuracy: full.length ? Math.max(...full.map((r) => r.accuracy)) : null,
    troubleMeasures: Object.entries(mistakes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m]) => Number(m)),
  };
}

// ---- Backup -------------------------------------------------------------------

const listAllRuns = () => tx('runs', 'readonly', (s) => s.getAll());

export async function exportData() {
  return {
    app: 'piano-trainer',
    version: 1,
    exportedAt: Date.now(),
    settings: loadSettings(),
    pieces: await listPieces(),
    runs: (await listAllRuns()).map(({ id, ...run }) => run),
  };
}

// Merges a backup into what's stored: pieces with the same id are replaced,
// runs already present (same piece and time) are skipped, so restoring the
// same backup twice doesn't duplicate anything.
export async function importData(data) {
  if (data?.app !== 'piano-trainer' || !Array.isArray(data.pieces) || !Array.isArray(data.runs)) {
    throw new Error('Diese Datei ist keine Klaviertrainer-Sicherung.');
  }
  const key = (r) => `${r.pieceId}|${r.date}`;
  const existing = new Set((await listAllRuns()).map(key));
  const newRuns = data.runs.filter((r) => !existing.has(key(r))).map(({ id, ...run }) => run);

  await tx('pieces', 'readwrite', (s) => data.pieces.forEach((p) => s.put(p)));
  await tx('runs', 'readwrite', (s) => newRuns.forEach((r) => s.add(r)));
  return { pieces: data.pieces.length, runs: newRuns.length };
}

// Ask the browser not to clear our data under storage pressure (best effort).
export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---- Settings -----------------------------------------------------------------

const SETTINGS_KEY = 'piano-trainer.settings';
const DEFAULT_SETTINGS = { mode: 'wait', hands: 'both', loop: false, hints: true, tempo: 60, metronome: true, zoom: 1, keyboard: 'normal', sound: 'piano' };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
