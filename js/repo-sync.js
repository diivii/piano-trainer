// Pieces from a private GitHub repo: every .musicxml/.xml/.mxl file in it is
// imported when the app opens (for music that mustn't go on the public site).
// Needs a read-only token, stored only on this device. Files deleted from the
// repo stay in the app; pieces deleted in the app don't come back.

import * as storage from './storage.js';

const CONFIG_KEY = 'piano-trainer.repo';
const SCORE_FILE = /\.(musicxml|xml|mxl)$/i;

export function loadRepoConfig() {
  try {
    return { repo: '', token: '', lastSync: null, ...JSON.parse(localStorage.getItem(CONFIG_KEY)) };
  } catch {
    return { repo: '', token: '', lastSync: null };
  }
}

export function saveRepoConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// Imported files of a repo: { path: blob sha }, to spot new and changed ones.
const filesKey = (repo) => `piano-trainer.repo-files.${repo.toLowerCase()}`;

async function api(config, path) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  const res = await fetch(`https://api.github.com/repos/${config.repo}/${path}`, { headers, cache: 'no-store' });
  if (res.status === 409) return null; // empty repo
  if (res.status === 401) throw new Error('Der Zugangsschlüssel ist ungültig oder abgelaufen.');
  if (res.status === 404) throw new Error(`„${config.repo}“ nicht gefunden, oder der Schlüssel hat keinen Zugriff darauf.`);
  if (!res.ok) throw new Error(`GitHub antwortet mit Fehler ${res.status}.`);
  return res.json();
}

// File content as the library stores it: text for MusicXML, a binary string for .mxl.
async function fileContent(config, file) {
  const { content } = await api(config, `git/blobs/${file.sha}`);
  const binary = atob(content.replace(/\s/g, ''));
  if (/\.mxl$/i.test(file.path)) return binary;
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

// Title and composer from the MusicXML header (the catalog writes them there),
// else the file name.
function describe(path, content) {
  const name = path.split('/').pop().replace(SCORE_FILE, '');
  if (/\.mxl$/i.test(path)) return { title: name, composer: '' };
  const doc = new DOMParser().parseFromString(content, 'application/xml');
  const text = (selector) => doc.querySelector(selector)?.textContent.trim();
  return {
    title: text('work > work-title') || text('movement-title') || name,
    composer: text('identification > creator[type="composer"]') || '',
  };
}

// Imports new files and updates changed ones. Returns the number of new pieces.
export async function syncRepo(config = loadRepoConfig()) {
  if (!config.repo) return 0;
  const tree = await api(config, 'git/trees/HEAD?recursive=1');
  const files = (tree?.tree ?? []).filter((f) => f.type === 'blob' && SCORE_FILE.test(f.path));
  const known = JSON.parse(localStorage.getItem(filesKey(config.repo)) || '{}');
  let added = 0;
  for (const file of files) {
    if (known[file.path] === file.sha) continue;
    const id = `repo:${file.path}`;
    const stored = await storage.getPiece(id);
    if (file.path in known && !stored) continue; // deleted in the app
    const content = await fileContent(config, file);
    const { title, composer } = describe(file.path, content);
    // Changed in the repo: same id, so its practice history stays; rate it again.
    const { difficulty, difficultyVersion, ...rest } = stored ?? {};
    await storage.savePiece({
      ...(stored?.difficultyManual ? stored : rest),
      id,
      title,
      composer,
      content,
      addedAt: stored?.addedAt ?? Date.now(),
    });
    if (!stored) added++;
    known[file.path] = file.sha;
    localStorage.setItem(filesKey(config.repo), JSON.stringify(known));
  }
  saveRepoConfig({ ...config, lastSync: Date.now(), lastError: null });
  return added;
}
