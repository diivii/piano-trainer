// Estimates how hard a piece is ('easy' | 'medium' | 'hard') from its loaded
// score (see score-view.js for the shape). No display code.
//
// Each feature adds points (speed up to 3, the rest up to 2); 0–2 points is
// easy, 3–5 medium, 6+ hard.
// Calibrated on the built-in samples: children's songs come out easy, simple
// two-hand arrangements medium, and Für Elise, Bach and Grieg hard.

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const DIFFICULTY_LABEL = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export function estimateDifficulty(piece) {
  const steps = piece.steps.filter((s) => s.notes.length);
  const notes = steps.flatMap((s) => s.notes);
  if (!notes.length) return 'easy';
  const share = (count) => count / steps.length;
  const inHand = (step, staff) => step.notes.filter((n) => n.staff === staff).length;
  const range = (staff) => {
    const pitches = notes.filter((n) => n.staff === staff).map((n) => n.midi);
    return pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0;
  };

  const wholeNotes = piece.measures.reduce((sum, m) => sum + m.duration, 0);
  const seconds = (wholeNotes * 4 * 60) / (piece.tempo || 100);
  const notesPerSecond = notes.length / seconds;
  // Share of notes that follow the previous one within 0.3 s (runs of fast notes).
  const secondsPerWhole = (4 * 60) / (piece.tempo || 100);
  const fast = steps.slice(1).filter((s, i) => (s.time - steps[i].time) * secondsPerWhole <= 0.3).length
    / Math.max(1, steps.length - 1);
  const chords = share(steps.filter((s) => inHand(s, 0) > 1 || inHand(s, 1) > 1).length);
  const bothHands = share(steps.filter((s) => inHand(s, 0) && inHand(s, 1)).length);
  const handRange = Math.max(range(0), range(1)); // how far one hand has to move
  const blackKeys = notes.filter((n) => BLACK_KEYS.has(n.midi % 12)).length / notes.length;

  const score =
    (notesPerSecond < 2.5 ? 0 : notesPerSecond < 3.5 ? 1 : notesPerSecond < 5 ? 2 : 3)
    + (fast < 0.25 ? 0 : fast < 0.5 ? 1 : 2)
    + (chords < 0.2 ? 0 : chords < 0.6 ? 1 : 2)
    + (bothHands < 0.4 ? 0 : 1)
    + (handRange <= 12 ? 0 : handRange <= 19 ? 1 : 2)
    + (blackKeys < 0.03 ? 0 : blackKeys < 0.15 ? 1 : 2)
    + (piece.measureCount <= 24 ? 0 : piece.measureCount <= 48 ? 1 : 2);
  return score <= 2 ? 'easy' : score <= 5 ? 'medium' : 'hard';
}
