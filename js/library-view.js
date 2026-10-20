// The piece library: one card per stored piece with its practice stats,
// in sections by difficulty (easy first).

import { DIFFICULTIES, DIFFICULTY_LABEL } from './difficulty.js';

function relativeDay(timestamp) {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(timestamp)) / 86400000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  return new Date(timestamp).toLocaleDateString('de-DE');
}

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// items: [{ piece, stats }]  (stats may be null if never practiced)
export function renderLibrary(container, items, { onOpen, onDelete, onDifficulty }) {
  if (!items.length) {
    container.replaceChildren(el('p', 'empty', 'Noch keine Stücke. Importiere eine MusicXML-Datei, um loszulegen.'));
    return;
  }

  const groups = [...DIFFICULTIES.map((d) => [d, DIFFICULTY_LABEL[d]]), [undefined, 'Wird eingestuft …']];
  container.replaceChildren(...groups.flatMap(([difficulty, label]) => {
    const group = items.filter((i) => i.piece.difficulty === difficulty);
    if (!group.length) return [];
    const section = el('section', `library-section ${difficulty ?? 'unrated'}`);
    section.append(el('h3', 'library-section-title', label), el('div', 'library-cards'));
    section.lastChild.append(...group.map((item) => card(item, { onOpen, onDelete, onDifficulty })));
    return [section];
  }));
}

function card({ piece, stats }, { onOpen, onDelete, onDifficulty }) {
  const node = el('div', 'piece-card');
  node.tabIndex = 0;
  node.addEventListener('click', () => onOpen(piece.id));
  node.addEventListener('keydown', (e) => e.key === 'Enter' && onOpen(piece.id));

  node.append(el('h3', '', piece.title));
  if (piece.composer) node.append(el('div', 'composer', piece.composer));

  if (stats?.troubleMeasures.length) {
    node.append(el('div', 'trouble', `Üben: Takt ${stats.troubleMeasures.join(', ')}`));
  }

  const meta = el('div', 'meta');
  const stat = (label, value) => {
    const span = el('span', '', `${label} `);
    span.append(el('b', '', value));
    meta.append(span);
  };
  if (stats) {
    stat('Zuletzt', relativeDay(stats.lastPracticed));
    stat('Durchgänge', String(stats.runs));
    if (stats.bestAccuracy !== null) stat('Bestes', `${Math.round(stats.bestAccuracy * 100)} %`);
  } else {
    meta.append(el('span', '', 'Noch nicht geübt'));
  }
  node.append(meta);

  const del = el('button', 'delete icon-button', '✕');
  del.type = 'button';
  del.setAttribute('aria-label', `${piece.title} löschen`);
  // Two taps to delete (confirm() dialogs don't work in some iOS in-app browsers).
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    if (del.classList.contains('confirm')) {
      onDelete(piece);
      return;
    }
    del.classList.add('confirm');
    del.textContent = 'Löschen?';
    setTimeout(() => {
      del.classList.remove('confirm');
      del.textContent = '✕';
    }, 3000);
  });
  node.append(del);

  if (piece.difficulty) {
    const chip = el('button', `difficulty ${piece.difficulty}`, DIFFICULTY_LABEL[piece.difficulty]);
    chip.type = 'button';
    chip.title = 'Tippen, um die Schwierigkeit zu ändern';
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      onDifficulty(piece);
    });
    node.append(chip);
  }

  return node;
}
