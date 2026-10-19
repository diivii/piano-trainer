# Piano Trainer

A personal piano practice app. It reads which keys are played on a digital piano
(built for a Kawai CN201) over MIDI, shows the piece as sheet music, and follows
along as you play.

Live: https://diivii.github.io/piano-trainer/

## Features

- **Library**: imported pieces are stored on the device, with last practiced,
  number of runs, best accuracy and the bars with the most mistakes
- **Sheet music** from MusicXML (`.musicxml`, `.xml`, `.mxl`), rendered with
  [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/)
- User interface in German (note names C, Cis, … B, H)
- **Listen** (“Anhören”): plays the piece, selected bars or one hand once, through
  the digital piano via MIDI out or with a simple built-in sound on the device
- **Wait mode**: the cursor moves on once the right note or chord is played
- **Tempo mode**: play along with a metronome (with count-in) at an adjustable
  tempo; every note is judged as on time, early, late or missed
- Notes are colored in the score: green = right, orange = early/late or right
  after a mistake, red = wrong/missed
- Practice hands separately, loop a range of bars, key hints on the keyboard
- Every run is saved; settings are remembered
- **Backup / restore** of pieces and history as a JSON file
- Touch-friendly layout with focus mode and note zoom
- Computer-keyboard / mouse simulator and a MIDI event log for testing

## Running locally

Needs Python 3. Double-click `start-server.cmd`, or:

```
python tools/serve.py
```

then open http://localhost:8000 in Chrome or Edge. The server disables caching,
so a refresh always loads the latest code.

Simulator keys: `A`–`'` white keys, `W E T Y U O P` black keys, `Z`/`X` octave,
`Space` sustain pedal, hold `Shift` for loud notes.

## On the iPad

Safari doesn't support Web MIDI. Open the live URL in a Web MIDI capable browser
such as "Web MIDI Browser", and connect the piano via USB or Bluetooth MIDI (pair
Bluetooth inside that app, not in iOS Settings). Tap the connection pill in the
top-right for status and the MIDI log.

Pieces and progress live in that browser's storage on the iPad. iOS can clear
website data, so use **Backup** in the library now and then.

## Deploying

GitHub Pages serves the `main` branch. Push, wait ~1 minute, reload on the iPad.

## Project layout

| File | Purpose |
|---|---|
| `js/main.js` | App controller: library and practice screens, wiring |
| `js/midi-input.js` | All piano input (Web MIDI + simulator) as normalized events. The only part to replace for a native app. |
| `js/score-view.js` | Sheet music rendering, cursor, note colors; turns a score into practice steps |
| `js/practice.js` | Wait-mode logic, hands, looping, mistake stats (no display code) |
| `js/tempo-practice.js` | Tempo-mode logic and timing judgement |
| `js/metronome.js` | Metronome clicks via Web Audio |
| `js/player.js` | Plays a piece back (MIDI out to the piano, or a Web Audio synth) |
| `js/storage.js` | IndexedDB (pieces, runs), settings, backup import/export |
| `js/backup.js` | Saving/restoring backup files (share sheet, download or clipboard) |
| `js/library-view.js` | Library cards |
| `js/keyboard-view.js` | On-screen 88-key piano |
| `js/debug-panel.js` | MIDI event log |
| `vendor/` | Bundled OpenSheetMusicDisplay 2.2.1 (BSD-3 license) |
| `tools/serve.py` | Local no-cache dev server |
| `tools/make_samples.py` | Generates the built-in sample pieces and `samples/index.json` |
