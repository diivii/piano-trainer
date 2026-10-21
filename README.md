# Piano Trainer

A personal piano practice app. It reads which keys are played on a digital piano
(built for a Kawai CN201) over MIDI, shows the piece as sheet music, and follows
along as you play.

Live: https://diivii.github.io/piano-trainer/

## Features

- **Profiles** for Emil 🦖 and Julia 🦄: tap the button at the top of the library
  to switch. Each has a color theme (green / purple) so it's clear whose turn it is.
  Pieces are shared; practice history, stats and settings are per person
- **Levels**: every finished run earns points (notes played × accuracy², ×1.5 or
  more in tempo mode, fewer from the 3rd run of a piece on the same day). The
  level and a progress bar sit in the header; the results card fills the bar and
  plays a little jingle on a new level
- **Difficulty**: the library shows three columns, Leicht / Mittel / Schwer;
  in each, pieces not played for the longest time come first, so just
  practiced ones move to the bottom (per person). Each piece
  is rated automatically from its notes (speed, chords, both hands, hand range,
  black keys, length); tap the label on a card to change it
- **36 built-in pieces** from easy to hard (all public domain): 22 simple
  arrangements (children's songs, Stille Nacht, Kanon in D, Gymnopédie, Für Elise,
  Bach's Präludium, Mozart KV 545, Eine kleine Nachtmusik, Morgenstimmung, …) and
  14 original scores (Für Elise, Präludium BWV 846, KV 545, Clementi, Schumann,
  Chopin, Satie, Burgmüller, Mondscheinsonate, …), some pieces in both versions.
  The originals come from [PDMX](https://zenodo.org/records/15571083) (Long et al.,
  CC BY 4.0), a dataset of MuseScore scores marked public domain or CC0
- **Stars** per piece (1–3) for the best whole-piece run with both hands
  (from 70 %, 85 %, 95 %), on the cards and the results card
- **Hand colors**: key hints are green for the right hand, orange for the left;
  a hint fades out once played and lights up again for a repeated note
- On a new level the app offers to save a backup (also after a looped section)
- **Settings** (⚙ in the library): reset the selected person's progress
  (behind a collapsed section and a second tap)
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
- Two views of the sheet music, switchable on the score (Zeile / Seite): one long line
  that scrolls sideways with the cursor, or wrapped lines that scroll down; each view
  keeps its own size (A−/A+), per person
- Touch-friendly layout with focus mode
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
such as "MIDIWeb Browser" (it reopens the last page, so a Shortcuts icon on the
home screen that opens the app works like an app icon), and connect the piano via USB or Bluetooth MIDI (pair
Bluetooth inside that app, not in iOS Settings). Tap the connection pill in the
top-right for status and the MIDI log.

Pieces and progress live in that browser's storage on the iPad. iOS can clear
website data, so use **Backup** in the library now and then.

## Deploying

Every push to `main` runs the GitHub Actions workflow `.github/workflows/pages.yml`,
which stamps the commit as version (`tools/stamp_version.py`) and publishes to
GitHub Pages. Wait ~1 minute, then reload on the iPad.

`index.html` is a small shell that fetches `version.json` uncached on every start
and loads `app.html`, the stylesheet and all modules with `?v=<version>`, so a
reload always gets the latest version (GitHub Pages lets browsers cache files for
10 minutes). The connection dialog's "Technische Details" shows the running version.
Locally there's no `version.json` and files load unversioned ("lokal").

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Shell: startup error display and bootstrap that loads the current version |
| `app.html` | The app's markup (library, practice screen, dialogs) |
| `js/main.js` | App controller: library and practice screens, wiring |
| `js/midi-input.js` | All piano input (Web MIDI + simulator) as normalized events. The only part to replace for a native app. |
| `js/score-view.js` | Sheet music rendering (line or page view, smooth follow scrolling), cursor, note colors; turns a score into practice steps |
| `js/practice.js` | Wait-mode logic, hands, looping, mistake stats (no display code) |
| `js/difficulty.js` | Estimates a piece's difficulty from its score |
| `js/levels.js` | Points per run and level calculation |
| `js/tempo-practice.js` | Tempo-mode logic and timing judgement |
| `js/metronome.js` | Metronome clicks via Web Audio |
| `js/player.js` | Plays a piece back (MIDI out to the piano, or a Web Audio synth) |
| `js/storage.js` | Profiles, IndexedDB (pieces, runs), settings, backup import/export |
| `js/backup.js` | Saving/restoring backup files (share sheet, download or clipboard) |
| `js/library-view.js` | Library cards |
| `js/keyboard-view.js` | On-screen 88-key piano |
| `js/debug-panel.js` | MIDI event log |
| `vendor/` | Bundled OpenSheetMusicDisplay 2.2.1 (BSD-3 license) |
| `tools/serve.py` | Local no-cache dev server |
| `tools/stamp_version.py` | Adds the version to imports and writes `version.json` (used when publishing) |
| `tools/make_samples.py` | Generates the built-in arrangements and `samples/index.json` |
| `tools/pdmx.py` | Piano catalog of a local PDMX copy (`../PDMX`): search it, add scores as samples |
| `tools/originals.json` | The samples taken from PDMX, with their source file and license |
