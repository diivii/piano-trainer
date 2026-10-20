// Points and levels. Every finished run earns points; a profile's level comes
// from the sum of the points of all its runs. No display code.

// Points for one run:
//   notes played (longer pieces, chords and both hands give more)
//   × accuracy² (clean playing matters a lot: 90% → 0.81, 60% → 0.36)
//   × 1.5 in tempo mode, up to 2.25 when faster than the piece's own tempo
//   × less for the 3rd and later run of the same piece on the same day.
export function runPoints({ notes, accuracy, mode, tempo, pieceTempo, runsToday }) {
  const tempoFactor = mode === 'tempo'
    ? 1.5 * Math.min(1.5, Math.max(1, tempo / (pieceTempo || tempo)))
    : 1;
  return Math.round(notes * accuracy ** 2 * tempoFactor * repeatFactor(runsToday));
}

// runsToday: earlier runs of the same piece today. The first two count fully,
// then 0.75, 0.56, 0.42, … but never below a quarter.
export function repeatFactor(runsToday) {
  return runsToday < 2 ? 1 : Math.max(0.25, 0.75 ** (runsToday - 1));
}

// Points needed to go from `level` to the next one: 100, 150, 200, …
export const pointsForLevel = (level) => 50 + 50 * level;

// { level, points (into the current level), needed (for the next level) }
export function levelInfo(total) {
  let level = 1;
  let rest = total;
  while (rest >= pointsForLevel(level)) {
    rest -= pointsForLevel(level);
    level++;
  }
  return { level, points: rest, needed: pointsForLevel(level) };
}
