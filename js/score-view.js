// Sheet music rendering via OpenSheetMusicDisplay (bundled in vendor/, loaded as a global).
// Turns a MusicXML score into a flat list of "steps" the practice logic can use,
// moves the on-screen cursor, and colors notes for feedback.
//
// Step shape: { index, measure (1-based number), time, notes: [{ midi, staff, duration }] }
//   time, duration: in whole notes (time from the start of the piece)
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
      autoResize: false, // handled by the ResizeObserver below
      backend: 'svg',
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      followCursor: false, // scrolled by follow()
      renderSingleHorizontalStaffline: true,
    });
    // 'line': the whole piece as one line that scrolls sideways, zoomed to the
    // height (times scale). 'page': wrapped lines, scrolling down; zoom = scale.
    this.view = 'line';
    this.scale = 1;
    this.steps = [];
    this.stepNotes = []; // step index -> OSMD notes, parallel to step.notes
    this.colors = new Map(); // step index -> [color per note]
    this.cursorIndex = 0;
    this.section = null; // { from, to, pending } highlighted bars

    // Every render redraws the SVG, so note colors and bar highlights are
    // re-applied afterwards.
    const render = this.osmd.render.bind(this.osmd);
    this.osmd.render = () => {
      render();
      this.afterRender();
    };

    // Line view refits when the height changes (focus mode, keyboard size),
    // page view re-wraps when the width changes. Watches the parent: its size
    // doesn't depend on the score's scrollbars.
    let last = { width: 0, height: 0 };
    new ResizeObserver(() => requestAnimationFrame(() => {
      const size = { width: this.container.clientWidth, height: this.container.clientHeight };
      const changed = this.view === 'line' ? size.height !== last.height : size.width !== last.width;
      last = size;
      if (changed && this.steps.length) this.layout();
      else this.follow(false);
    })).observe(container.parentElement);

    // Smooth scrolling towards the cursor; a touch on the score hands over to the finger.
    this.scrollTarget = null;
    for (const type of ['pointerdown', 'wheel']) {
      container.addEventListener(type, () => (this.scrollTarget = null), { passive: true });
    }
  }

  setLayout(view, scale) {
    const [min, max] = view === 'line' ? [0.5, 1.5] : [0.5, 2];
    scale = Math.round(Math.min(max, Math.max(min, scale)) * 10) / 10;
    if (view === this.view && scale === this.scale) return;
    const viewChanged = view !== this.view;
    this.view = view;
    this.scale = scale;
    if (viewChanged) {
      this.osmd.setOptions({ renderSingleHorizontalStaffline: view === 'line' });
      this.container.classList.toggle('page-view', view === 'page');
    }
    if (this.steps.length) this.layout(viewChanged);
  }

  // viewChanged: the drawn SVG is still the other view, so it can't be measured.
  layout(viewChanged = false) {
    if (this.view === 'page') {
      this.osmd.zoom = this.scale;
      this.osmd.render();
    } else {
      if (viewChanged) this.osmd.render();
      this.fit(true);
    }
    this.follow(false);
  }

  // Line view: zoom so the staff line fills part of the height (times this.scale).
  fit(force = false) {
    const svg = this.container.querySelector('svg');
    const height = this.container.clientHeight;
    const drawn = parseFloat(svg?.getAttribute('height'));
    if (!height || !drawn) return; // hidden (e.g. the background difficulty rating)
    const zoom = Math.min(5, Math.max(0.4, ((height * 0.65) / (drawn / this.osmd.zoom)) * this.scale));
    if (!force && Math.abs(zoom - this.osmd.zoom) / this.osmd.zoom < 0.02) return;
    this.osmd.zoom = zoom;
    this.osmd.render();
  }

  // Line view: cursor about a third from the left, so the next bars are visible.
  // Page view: the cursor's line near the top, so the lines below are visible.
  follow(smooth = true) {
    const el = this.osmd.cursor?.cursorElement;
    if (!el || el.style.display === 'none') return;
    const c = this.container;
    const box = c.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const target = this.view === 'line'
      ? { left: r.left - box.left + c.scrollLeft - c.clientWidth * 0.3, top: c.scrollTop }
      : { left: 0, top: r.top - box.top + c.scrollTop - c.clientHeight * 0.08 };
    target.left = Math.min(c.scrollWidth - c.clientWidth, Math.max(0, target.left));
    target.top = Math.min(c.scrollHeight - c.clientHeight, Math.max(0, target.top));
    if (!smooth) {
      this.scrollTarget = null;
      c.scrollLeft = target.left;
      c.scrollTop = target.top;
      return;
    }
    const running = this.scrollTarget;
    this.scrollTarget = target;
    if (running) return;
    // Eases towards the latest target, so quick steps blend into one gliding motion.
    let pos = { left: c.scrollLeft, top: c.scrollTop };
    let then = performance.now();
    const frame = (now) => {
      const t = this.scrollTarget;
      if (!t) return;
      const k = 1 - Math.exp(-Math.min(64, now - then) / 260);
      then = now;
      pos = { left: pos.left + (t.left - pos.left) * k, top: pos.top + (t.top - pos.top) * k };
      if (Math.abs(t.left - pos.left) < 0.5 && Math.abs(t.top - pos.top) < 0.5) {
        pos = t;
        this.scrollTarget = null;
      }
      c.scrollLeft = pos.left;
      c.scrollTop = pos.top;
      if (this.scrollTarget) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // content: MusicXML text, or the binary string of a compressed .mxl file.
  async load(content) {
    this.colors.clear();
    this.section = null;
    this.steps = [];
    await this.osmd.load(content);
    if (this.view === 'page') this.osmd.zoom = this.scale;
    this.osmd.render();
    this.osmd.cursor.show();
    this.steps = this.extractSteps();
    if (this.view === 'line') this.fit();
    this.moveTo(0);
    this.follow(false);
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
        // How long it sounds (whole notes), including notes tied to it.
        const tied = note.NoteTie?.Notes ?? [note];
        notes.push({
          midi: note.halfTone + 12,
          staff: note.ParentStaff?.idInMusicSheet ?? 0,
          duration: tied.reduce((sum, n) => sum + (n.Length?.RealValue ?? 0), 0),
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
    this.follow();
  }

  hideCursor() {
    this.osmd.cursor.hide();
  }

  afterRender() {
    if (!this.steps.length) return;
    for (const [stepIndex, colors] of this.colors) {
      colors.forEach((color, i) => color && this.paint(this.stepNotes[stepIndex][i], color));
    }
    this.osmd.cursor.update();
    this.drawSection();
    this.follow(false);
  }

  // ---- Bars: hit testing and highlighting ----

  // Screen rectangles of every bar (spanning all staves), relative to the SVG.
  measureBoxes() {
    const unit = 10 * this.osmd.zoom; // OSMD layout units -> pixels
    const pad = 2.5; // room above/below the staves for ledger notes
    const staffHeight = 4; // five staff lines span four units
    const boxes = [];
    for (const staves of this.osmd.GraphicSheet?.MeasureList ?? []) {
      const list = staves.filter(Boolean);
      if (!list.length) continue;
      const first = list[0].PositionAndShape;
      const last = list.at(-1).PositionAndShape;
      boxes.push({
        number: list[0].MeasureNumber ?? list[0].parentSourceMeasure?.MeasureNumber,
        left: (first.AbsolutePosition.x + first.BorderLeft) * unit,
        right: (first.AbsolutePosition.x + first.BorderRight) * unit,
        // From the staff lines rather than the content, so all bars of a line line up.
        top: (first.AbsolutePosition.y - pad) * unit,
        bottom: (last.AbsolutePosition.y + staffHeight + pad) * unit,
      });
    }
    return boxes;
  }

  svgOffset() {
    const svg = this.container.querySelector('svg');
    if (!svg) return null;
    const s = svg.getBoundingClientRect();
    const c = this.container.getBoundingClientRect();
    return { x: s.left - c.left + this.container.scrollLeft, y: s.top - c.top + this.container.scrollTop, rect: s };
  }

  // Bar number at a screen position, or null.
  measureAt(clientX, clientY) {
    const offset = this.svgOffset();
    if (!offset) return null;
    const x = clientX - offset.rect.left;
    const y = clientY - offset.rect.top;
    return this.measureBoxes().find((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)?.number ?? null;
  }

  // Highlight bars from..to; pending = only the start has been picked so far.
  setSection(section) {
    this.section = section;
    this.drawSection();
  }

  drawSection() {
    this.container.querySelector('.bar-layer')?.remove();
    const offset = this.svgOffset();
    if (!this.section || !offset) return;
    const layer = document.createElement('div');
    layer.className = `bar-layer${this.section.pending ? ' pending' : ''}`;
    for (const box of this.measureBoxes()) {
      if (box.number < this.section.from || box.number > this.section.to) continue;
      const mark = document.createElement('div');
      mark.className = 'bar-mark';
      Object.assign(mark.style, {
        left: `${offset.x + box.left}px`,
        top: `${offset.y + box.top}px`,
        width: `${box.right - box.left}px`,
        height: `${box.bottom - box.top}px`,
      });
      layer.append(mark);
    }
    this.container.append(layer);
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
