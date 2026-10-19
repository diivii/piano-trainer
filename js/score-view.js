// Sheet music rendering via OpenSheetMusicDisplay (loaded as a global from the CDN).
// Turns a MusicXML score into a flat list of "steps" the practice logic can use,
// moves the on-screen cursor, and colors notes for feedback.
//
// Step shape: { index, measure (1-based number), time, notes: [{ midi, staff }] }
//   time: position in whole notes from the start of the piece
//   staff 0 = upper staff (usually right hand), staff 1 = lower staff (left hand)
//
// Measure shape: { number, start, duration, beats, beatType }  (start/duration in whole notes)

export const STAFF = { RIGHT: 0, LEFT: 1 };

export const NOTE_COLOR = {
  GOOD: '#1f9d55',
  OK: '#d69e2e',
  BAD: '#e53e3e',
};

export class ScoreView {
  constructor(container) {
    this.container = container;
    this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      followCursor: true,
    });
    this.steps = [];
    this.stepNotes = []; // step index -> OSMD notes, parallel to step.notes
    this.colors = new Map(); // step index -> [color per note]
    this.cursorIndex = 0;
  }

  // content: MusicXML text, or the binary string of a compressed .mxl file.
  async load(content) {
    await this.osmd.load(content);
    this.osmd.render();
    this.osmd.cursor.show();
    this.colors.clear();
    this.steps = this.extractSteps();
    this.moveTo(0);
    const sheet = this.osmd.Sheet;
    return {
      title: sheet.TitleString || 'Untitled',
      composer: sheet.ComposerString || '',
      measureCount: sheet.SourceMeasures.length,
      tempo: Math.round(sheet.DefaultStartTempoInBpm || sheet.SourceMeasures[0]?.TempoInBPM || 100),
      measures: sheet.SourceMeasures.map((m) => ({
        number: m.MeasureNumber,
        start: m.AbsoluteTimestamp.RealValue,
        duration: m.Duration.RealValue,
        beats: m.ActiveTimeSignature?.Numerator ?? 4,
        beatType: m.ActiveTimeSignature?.Denominator ?? 4,
      })),
      steps: this.steps,
    };
  }

  extractSteps() {
    const cursor = this.osmd.cursor;
    const steps = [];
    this.stepNotes = [];
    cursor.reset();
    while (!cursor.iterator.EndReached) {
      const notes = [];
      const osmdNotes = [];
      for (const note of cursor.NotesUnderCursor()) {
        if (note.isRest()) continue;
        if (note.ParentVoiceEntry?.IsGrace) continue;
        // A note tied from an earlier one keeps sounding; it isn't played again.
        if (note.NoteTie && note.NoteTie.StartNote !== note) continue;
        notes.push({
          midi: note.halfTone + 12,
          staff: note.ParentStaff?.idInMusicSheet ?? 0,
        });
        osmdNotes.push(note);
      }
      steps.push({
        index: steps.length,
        measure: cursor.iterator.CurrentMeasure?.MeasureNumber ?? cursor.iterator.CurrentMeasureIndex + 1,
        time: cursor.iterator.currentTimeStamp.RealValue,
        notes,
      });
      this.stepNotes.push(osmdNotes);
      cursor.next();
    }
    cursor.reset();
    this.cursorIndex = 0;
    return steps;
  }

  moveTo(index) {
    const cursor = this.osmd.cursor;
    if (index < this.cursorIndex) {
      cursor.reset();
      this.cursorIndex = 0;
    }
    while (this.cursorIndex < index && !cursor.iterator.EndReached) {
      cursor.next();
      this.cursorIndex++;
    }
    cursor.show();
  }

  hideCursor() {
    this.osmd.cursor.hide();
  }

  get zoom() {
    return this.osmd.zoom;
  }

  setZoom(zoom) {
    this.osmd.zoom = Math.min(2, Math.max(0.5, zoom));
    if (!this.steps.length) return;
    this.osmd.render(); // redraws the SVG, so colors have to be applied again
    for (const [stepIndex, colors] of this.colors) {
      colors.forEach((color, i) => color && this.paint(this.stepNotes[stepIndex][i], color));
    }
    this.osmd.cursor.update();
  }

  // Color one note of a step (matched by MIDI pitch), or all of them.
  colorNote(stepIndex, midi, color) {
    const step = this.steps[stepIndex];
    if (!step) return;
    const colors = this.colors.get(stepIndex) ?? step.notes.map(() => null);
    step.notes.forEach((n, i) => {
      if (midi === null || n.midi === midi) {
        colors[i] = color;
        this.paint(this.stepNotes[stepIndex][i], color);
      }
    });
    this.colors.set(stepIndex, colors);
  }

  colorOf(stepIndex, midi) {
    const i = this.steps[stepIndex]?.notes.findIndex((n) => n.midi === midi);
    return this.colors.get(stepIndex)?.[i] ?? null;
  }

  clearColors() {
    for (const [stepIndex] of this.colors) {
      for (const note of this.stepNotes[stepIndex]) this.paint(note, null);
    }
    this.colors.clear();
  }

  paint(note, color) {
    const el = this.osmd.rules.GNote(note)?.getSVGGElement?.();
    if (!el) return;
    for (const shape of el.querySelectorAll('path, ellipse, rect')) {
      if (color) {
        shape.dataset.origFill ??= shape.getAttribute('fill') ?? '';
        shape.dataset.origStroke ??= shape.getAttribute('stroke') ?? '';
        shape.setAttribute('fill', color);
        shape.setAttribute('stroke', color);
      } else if (shape.dataset.origFill !== undefined) {
        for (const attr of ['fill', 'stroke']) {
          const orig = shape.dataset[attr === 'fill' ? 'origFill' : 'origStroke'];
          if (orig) shape.setAttribute(attr, orig);
          else shape.removeAttribute(attr);
        }
      }
    }
  }
}
