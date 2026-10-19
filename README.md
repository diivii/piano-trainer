# Piano Trainer

A personal piano practice app. It reads which keys are played on a digital piano
(built for a Kawai CN201) over MIDI, shows the piece as sheet music, and follows
along as you play.

## Features

- Sheet music from MusicXML (`.musicxml`, `.xml`, `.mxl`), rendered with
  [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/)
- Wait mode: the cursor moves on once the right note or chord is played
- Practice hands separately, loop a range of bars
- Wrong notes are tracked per bar, with accuracy and time per run
- Computer-keyboard / mouse simulator for testing without a piano
- MIDI debug panel

## Running locally

Needs Python 3. Double-click `start-server.cmd`, or:

```
python tools/serve.py
```

then open http://localhost:8000 in Chrome or Edge.

Simulator keys: `A`–`'` white keys, `W E T Y U O P` black keys, `Z`/`X` octave,
`Space` sustain pedal, hold `Shift` for loud notes.

## On the iPad

Safari doesn't support Web MIDI. Open the GitHub Pages URL in a Web MIDI capable
browser such as "Web MIDI Browser", and connect the piano via Bluetooth MIDI or USB.

## Project layout

| File | Purpose |
|---|---|
| `js/midi-input.js` | All piano input (Web MIDI + simulator) as normalized events. The only part to replace for a native app. |
| `js/score-view.js` | Sheet music rendering and cursor; turns a score into practice steps |
| `js/practice.js` | Wait-mode logic, hands, looping, mistake stats (no display code) |
| `js/keyboard-view.js` | On-screen 88-key piano |
| `js/debug-panel.js` | MIDI event log |
| `tools/make_sample.py` | Generates the sample piece in `samples/` |
