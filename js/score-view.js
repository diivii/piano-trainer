// Sheet music rendering via OpenSheetMusicDisplay (loaded as a global from the CDN).
// Turns a MusicXML score into a flat list of "steps" the practice logic can use,
// and moves the on-screen cursor to a given step.
//
// Step shape: { index, measure (1-based number), notes: [{ midi, staff }] }
//   staff 0 = upper staff (usually right hand), staff 1 = lower staff (left hand)

export const STAFF = { RIGHT: 0, LEFT: 1 };

export class ScoreView {
  constructor(container) {
    this.container = container;
    this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      followCursor: true,
    });
    this.steps = [];
    this.cursorIndex = 0;
  }

  // content: MusicXML text, or the binary string of a compressed .mxl file.
  async load(content) {
    await this.osmd.load(content);
    this.osmd.render();
    this.osmd.cursor.show();
    this.steps = this.extractSteps();
    this.moveTo(0);
    return {
      title: this.osmd.Sheet.TitleString || 'Untitled',
      measureCount: this.osmd.Sheet.SourceMeasures.length,
      steps: this.steps,
    };
  }

  extractSteps() {
    const cursor = this.osmd.cursor;
    const steps = [];
    cursor.reset();
    while (!cursor.iterator.EndReached) {
      const notes = [];
      for (const note of cursor.NotesUnderCursor()) {
        if (note.isRest()) continue;
        if (note.ParentVoiceEntry?.IsGrace) continue;
        // A note tied from an earlier one keeps sounding; it isn't played again.
        if (note.NoteTie && note.NoteTie.StartNote !== note) continue;
        notes.push({
          midi: note.halfTone + 12,
          staff: note.ParentStaff?.idInMusicSheet ?? 0,
        });
      }
      steps.push({
        index: steps.length,
        measure: cursor.iterator.CurrentMeasure?.MeasureNumber ?? cursor.iterator.CurrentMeasureIndex + 1,
        notes,
      });
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
}
