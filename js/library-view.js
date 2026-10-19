// The piece library: one card per stored piece with its practice stats.

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
export function renderLibrary(container, items, { onOpen, onDelete }) {
  if (!items.length) {
    container.replaceChildren(el('p', 'empty', 'Noch keine Stücke. Importiere eine MusicXML-Datei, um loszulegen.'));
    return;
  }

  container.replaceChildren(
    ...items.map(({ piece, stats }) => {
      const card = el('div', 'piece-card');
      card.tabIndex = 0;
      card.addEventListener('click', () => onOpen(piece.id));
      card.addEventListener('keydown', (e) => e.key === 'Enter' && onOpen(piece.id));

      card.append(el('h3', '', piece.title));
      if (piece.composer) card.append(el('div', 'composer', piece.composer));

      if (stats?.troubleMeasures.length) {
        card.append(el('div', 'trouble', `Üben: Takt ${stats.troubleMeasures.join(', ')}`));
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
      card.append(meta);

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
      card.append(del);

      return card;
    }),
  );
}
