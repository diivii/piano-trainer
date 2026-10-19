// Saving and restoring backups as a JSON file.
// Saving tries the share sheet first (on iPad: "Save to Files" / iCloud Drive),
// then a normal download, then the clipboard, because in-app browsers on iOS
// often support only some of these.

import { exportData, importData } from './storage.js';

const LAST_BACKUP_KEY = 'piano-trainer.last-backup';

export const lastBackup = () => Number(localStorage.getItem(LAST_BACKUP_KEY)) || null;

export async function saveBackup() {
  const data = await exportData();
  const json = JSON.stringify(data);
  const date = new Date().toISOString().slice(0, 10);
  const name = `piano-trainer-backup-${date}.json`;
  const file = new File([json], name, { type: 'application/json' });

  const done = (how) => {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    return { how, pieces: data.pieces.length, runs: data.runs.length };
  };

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Piano Trainer backup' });
      return done('shared');
    } catch (err) {
      if (err.name === 'AbortError') return null; // user cancelled the share sheet
    }
  }

  if ('download' in HTMLAnchorElement.prototype && !isIOS()) {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return done('downloaded');
  }

  await navigator.clipboard.writeText(json);
  return done('copied');
}

// source: a File from a file picker, or backup text (e.g. from the clipboard)
export async function restoreBackup(source) {
  const text = typeof source === 'string' ? source : await source.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Piano Trainer backup.');
  }
  return importData(data);
}

// Downloads silently do nothing in many iOS in-app browsers.
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
