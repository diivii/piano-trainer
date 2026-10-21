// Persistence on the device: imported pieces and practice history in IndexedDB
// (scores can be too large for localStorage), small settings in localStorage.
// Everything is plain JSON so it can be exported/imported later.

const DB_NAME = 'piano-trainer';
const DB_VERSION = 2;

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) db.createObjectStore('pieces', { keyPath: 'id' });
      // Version 2 added profiles. Runs from before had no owner and were mostly
      // testing, so they are dropped rather than assigned to someone.
      if (e.oldVersion < 2) {
        if (db.objectStoreNames.contains('runs')) db.deleteObjectStore('runs');
        const runs = db.createObjectStore('runs', { keyPath: 'id', autoIncrement: true });
        runs.createIndex('pieceId', 'pieceId');
        runs.createIndex('profilePiece', ['profile', 'pieceId']);
      }
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

// ---- Profiles -----------------------------------------------------------------
// Pieces are shared; practice runs and settings belong to the active profile.

export const PROFILES = [
  { id: 'emil', name: 'Emil', icon: '🦖' }, // theme colors: body[data-profile] in style.css
  { id: 'julia', name: 'Julia', icon: '🦄' },
];

const PROFILE_KEY = 'piano-trainer.profile';

export function currentProfile() {
  const id = localStorage.getItem(PROFILE_KEY);
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0];
}

export function setProfile(id) {
  localStorage.setItem(PROFILE_KEY, id);
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
  const runs = await listRuns(id, null);
  await tx('runs', 'readwrite', (s) => runs.forEach((r) => s.delete(r.id)));
}

// ---- Practice runs ------------------------------------------------------------
// { profile, pieceId, date, mode, hands, fromMeasure, toMeasure, fullPiece, accuracy, wrong,
//   seconds, laps, completed, mistakesByMeasure, tempo, points }

export const saveRun = (run) => tx('runs', 'readwrite', (s) => s.add({ profile: currentProfile().id, ...run }));

// Runs of the active profile (or all profiles, for deleting a piece).
export const listRuns = (pieceId, profile = currentProfile().id) =>
  tx('runs', 'readonly', (s) => (profile
    ? s.index('profilePiece').getAll([profile, pieceId])
    : s.index('pieceId').getAll(pieceId)));

// Deletes all practice runs of a profile (points, level, stars and stats
// start over). Pieces, settings and other profiles stay.
export async function deleteRuns(profile = currentProfile().id) {
  const runs = (await listAllRuns()).filter((r) => r.profile === profile);
  await tx('runs', 'readwrite', (s) => runs.forEach((r) => s.delete(r.id)));
  return runs.length;
}

// All points the profile has earned (its level comes from this, see levels.js).
export async function totalPoints(profile = currentProfile().id) {
  const runs = await listAllRuns();
  return runs.reduce((sum, r) => sum + (r.profile === profile ? r.points ?? 0 : 0), 0);
}

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
    version: 2,
    exportedAt: Date.now(),
    settings: Object.fromEntries(PROFILES.map((p) => [p.id, loadSettings(p.id)])),
    pieces: await listPieces(),
    runs: (await listAllRuns()).map(({ id, ...run }) => run),
  };
}

// Merges a backup into what's stored: pieces with the same id are replaced,
// runs already present (same profile, piece and time) are skipped, so restoring
// the same backup twice doesn't duplicate anything. Runs from version 1 backups
// have no profile and are left out (see the DB upgrade).
export async function importData(data) {
  if (data?.app !== 'piano-trainer' || !Array.isArray(data.pieces) || !Array.isArray(data.runs)) {
    throw new Error('Diese Datei ist keine Klaviertrainer-Sicherung.');
  }
  const key = (r) => `${r.profile}|${r.pieceId}|${r.date}`;
  const existing = new Set((await listAllRuns()).map(key));
  const known = new Set(PROFILES.map((p) => p.id));
  const newRuns = data.runs.filter((r) => known.has(r.profile) && !existing.has(key(r))).map(({ id, ...run }) => run);

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

// Per profile. The pre-profile settings key serves as the starting point.
const OLD_SETTINGS_KEY = 'piano-trainer.settings';
const settingsKey = (profile) => `${OLD_SETTINGS_KEY}.${profile}`;
const DEFAULT_SETTINGS = { mode: 'wait', hands: 'both', loop: false, hints: true, tempo: 60, metronome: true, scale: 1, keyboard: 'normal', sound: 'piano' };

export function loadSettings(profile = currentProfile().id) {
  try {
    const stored = localStorage.getItem(settingsKey(profile)) ?? localStorage.getItem(OLD_SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, profile = currentProfile().id) {
  localStorage.setItem(settingsKey(profile), JSON.stringify(settings));
}
