"""Generates the built-in sample pieces as MusicXML in samples/, plus
samples/index.json listing them (the app adds these to the library).

All melodies are public domain (traditional, or composers long dead); the
left-hand parts are simple accompaniments written for practice.

Notation per bar: space-separated "pitch:duration" tokens.
  pitch:    C4, F#5, Bb3 ... ; chords joined with "+" (C3+G3)
  duration: e = eighth, q = quarter, q. = dotted quarter, h = half,
            h. = dotted half, w = whole

Run: python tools/make_samples.py
"""
import json
import re
from pathlib import Path

DIVISIONS = 2  # per quarter note -> eighth = 1
DUR = {
    'e': (1, 'eighth', False), 'q': (2, 'quarter', False), 'q.': (3, 'quarter', True),
    'h': (4, 'half', False), 'h.': (6, 'half', True), 'w': (8, 'whole', False),
}
PITCH = re.compile(r'^([A-G])(#|b)?(\d)$')

# Chords used in left-hand parts
C, F, G = 'C3+G3', 'F2+C3', 'G2+D3'

PIECES = [
    {
        'id': 'mary-had-a-little-lamb',
        'title': 'Mary hat ein kleines Lamm',
        'composer': 'Traditionell (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 100,
        'rh': ['E4:q D4:q C4:q D4:q', 'E4:q E4:q E4:h', 'D4:q D4:q D4:h', 'E4:q G4:q G4:h',
               'E4:q D4:q C4:q D4:q', 'E4:q E4:q E4:q E4:q', 'D4:q D4:q E4:q D4:q', 'C4:w'],
        'lh': ['C3:w', 'C3:w', 'G2:w', 'C3:w', 'C3:w', 'C3:w', 'G2:w', 'C3:w'],
    },
    {
        'id': 'twinkle-twinkle',
        'title': 'Funkel, funkel, kleiner Stern',
        'composer': 'Traditionell (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 90,
        'rh': ['C4:q C4:q G4:q G4:q', 'A4:q A4:q G4:h', 'F4:q F4:q E4:q E4:q', 'D4:q D4:q C4:h',
               'G4:q G4:q F4:q F4:q', 'E4:q E4:q D4:h', 'G4:q G4:q F4:q F4:q', 'E4:q E4:q D4:h',
               'C4:q C4:q G4:q G4:q', 'A4:q A4:q G4:h', 'F4:q F4:q E4:q E4:q', 'D4:q D4:q C4:h'],
        'lh': [f'{C}:w', f'{F}:h {C}:h', f'{F}:h {C}:h', f'{G}:h {C}:h',
               f'{C}:h {F}:h', f'{C}:h {G}:h', f'{C}:h {F}:h', f'{C}:h {G}:h',
               f'{C}:w', f'{F}:h {C}:h', f'{F}:h {C}:h', f'{G}:h {C}:h'],
    },
    {
        'id': 'frere-jacques',
        'title': 'Bruder Jakob',
        'composer': 'Traditionell (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 100,
        'rh': ['C4:q D4:q E4:q C4:q', 'C4:q D4:q E4:q C4:q', 'E4:q F4:q G4:h', 'E4:q F4:q G4:h',
               'G4:e A4:e G4:e F4:e E4:q C4:q', 'G4:e A4:e G4:e F4:e E4:q C4:q',
               'C4:q G3:q C4:h', 'C4:q G3:q C4:h'],
        'lh': ['C3:w'] * 8,
    },
    {
        'id': 'au-clair-de-la-lune',
        'title': 'Au clair de la lune',
        'composer': 'Traditionell (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 90,
        'rh': ['C4:q C4:q C4:q D4:q', 'E4:h D4:h', 'C4:q E4:q D4:q D4:q', 'C4:w',
               'C4:q C4:q C4:q D4:q', 'E4:h D4:h', 'C4:q E4:q D4:q D4:q', 'C4:w',
               'D4:q D4:q D4:q D4:q', 'A3:h A3:h', 'D4:q C4:q B3:q A3:q', 'G3:w',
               'C4:q C4:q C4:q D4:q', 'E4:h D4:h', 'C4:q E4:q D4:q D4:q', 'C4:w'],
        'lh': [f'{C}:w', f'{C}:h {G}:h', f'{C}:h {G}:h', f'{C}:w',
               f'{C}:w', f'{C}:h {G}:h', f'{C}:h {G}:h', f'{C}:w',
               f'{G}:w', f'{F}:w', f'{G}:w', 'G2:w',
               f'{C}:w', f'{C}:h {G}:h', f'{C}:h {G}:h', f'{C}:w'],
    },
    {
        'id': 'jingle-bells',
        'title': 'Jingle Bells (Refrain)',
        'composer': 'J. Pierpont (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 120,
        'rh': ['E4:q E4:q E4:h', 'E4:q E4:q E4:h', 'E4:q G4:q C4:q. D4:e', 'E4:w',
               'F4:q F4:q F4:q. F4:e', 'F4:q E4:q E4:q E4:e E4:e', 'E4:q D4:q D4:q E4:q', 'D4:h G4:h',
               'E4:q E4:q E4:h', 'E4:q E4:q E4:h', 'E4:q G4:q C4:q. D4:e', 'E4:w',
               'F4:q F4:q F4:q F4:q', 'F4:q E4:q E4:q E4:e E4:e', 'G4:q G4:q F4:q D4:q', 'C4:w'],
        'lh': [f'{C}:w', f'{C}:w', f'{C}:w', f'{C}:w',
               f'{F}:w', f'{C}:w', f'{G}:w', f'{G}:w',
               f'{C}:w', f'{C}:w', f'{C}:w', f'{C}:w',
               f'{F}:w', f'{C}:w', f'{G}:w', f'{C}:w'],
    },
    {
        'id': 'minuet-in-g',
        'title': 'Menuett in G-Dur',
        'composer': 'C. Petzold (einfache Bearbeitung)',
        'time': (3, 4), 'key': 1, 'tempo': 100,
        'rh': ['D5:q G4:e A4:e B4:e C5:e', 'D5:q G4:q G4:q', 'E5:q C5:e D5:e E5:e F#5:e', 'G5:q G4:q G4:q',
               'C5:q D5:e C5:e B4:e A4:e', 'B4:q C5:e B4:e A4:e G4:e', 'F#4:q G4:e A4:e B4:e G4:e', 'A4:h.',
               'D5:q G4:e A4:e B4:e C5:e', 'D5:q G4:q G4:q', 'E5:q C5:e D5:e E5:e F#5:e', 'G5:q G4:q G4:q',
               'C5:q D5:e C5:e B4:e A4:e', 'B4:q C5:e B4:e A4:e G4:e', 'A4:q B4:e A4:e G4:e F#4:e', 'G4:h.'],
        'lh': ['G3:h.', 'B3:h.', 'C4:h.', 'B3:h.', 'A3:h.', 'G3:h.', 'D3:h.', 'D3:h.',
               'G3:h.', 'B3:h.', 'C4:h.', 'B3:h.', 'A3:h.', 'G3:h.', 'D3:h.', 'G2:h.'],
    },
    {
        'id': 'ode-to-joy',
        'title': 'Ode an die Freude',
        'composer': 'L. v. Beethoven (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 100,
        'rh': ['E4:q E4:q F4:q G4:q', 'G4:q F4:q E4:q D4:q', 'C4:q C4:q D4:q E4:q', 'E4:q. D4:e D4:h',
               'E4:q E4:q F4:q G4:q', 'G4:q F4:q E4:q D4:q', 'C4:q C4:q D4:q E4:q', 'D4:q. C4:e C4:h',
               'D4:q D4:q E4:q C4:q', 'D4:q E4:e F4:e E4:q C4:q', 'D4:q E4:e F4:e E4:q D4:q', 'C4:q D4:q G3:h',
               'E4:q E4:q F4:q G4:q', 'G4:q F4:q E4:q D4:q', 'C4:q C4:q D4:q E4:q', 'D4:q. C4:e C4:h'],
        'lh': [f'{C}:w', f'{G}:w', f'{C}:w', f'{G}:w',
               f'{C}:w', f'{G}:w', f'{C}:w', f'{G}:h {C}:h',
               f'{G}:w', f'{C}:w', f'{G}:w', f'{C}:h {G}:h',
               f'{C}:w', f'{G}:w', f'{C}:w', f'{G}:h {C}:h'],
    },
]


def note_xml(pitch, dur, staff, voice, chord=False):
    m = PITCH.match(pitch)
    if not m:
        raise ValueError(f'bad pitch {pitch!r}')
    step, accidental, octave = m.groups()
    alter = {'#': '<alter>1</alter>', 'b': '<alter>-1</alter>'}.get(accidental, '')
    duration, typ, dotted = DUR[dur]
    return (
        '<note>' + ('<chord/>' if chord else '')
        + f'<pitch><step>{step}</step>{alter}<octave>{octave}</octave></pitch>'
        + f'<duration>{duration}</duration><voice>{voice}</voice><type>{typ}</type>'
        + ('<dot/>' if dotted else '')
        + f'<staff>{staff}</staff></note>'
    )


def bar_xml(bar, staff, voice, expected, where):
    out, total = [], 0
    for token in bar.split():
        pitches, dur = token.split(':')
        total += DUR[dur][0]
        for i, p in enumerate(pitches.split('+')):
            out.append(note_xml(p, dur, staff, voice, chord=i > 0))
    if total != expected:
        raise ValueError(f'{where}: bar has {total} eighths, expected {expected}: {bar!r}')
    return ''.join(out)


def piece_xml(piece):
    beats, beat_type = piece['time']
    bar_len = beats * DIVISIONS * 4 // beat_type
    if len(piece['rh']) != len(piece['lh']):
        raise ValueError(f"{piece['id']}: hands have different numbers of bars")

    measures = []
    for i, (rh, lh) in enumerate(zip(piece['rh'], piece['lh']), start=1):
        head = ''
        if i == 1:
            head = (
                f'<attributes><divisions>{DIVISIONS}</divisions><key><fifths>{piece["key"]}</fifths></key>'
                f'<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time><staves>2</staves>'
                '<clef number="1"><sign>G</sign><line>2</line></clef>'
                '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
                '<direction placement="above"><direction-type><metronome>'
                f'<beat-unit>quarter</beat-unit><per-minute>{piece["tempo"]}</per-minute>'
                f'</metronome></direction-type><staff>1</staff><sound tempo="{piece["tempo"]}"/></direction>'
            )
        where = f"{piece['id']} bar {i}"
        measures.append(
            f'<measure number="{i}">{head}{bar_xml(rh, 1, 1, bar_len, where + " (RH)")}'
            f'<backup><duration>{bar_len}</duration></backup>{bar_xml(lh, 2, 5, bar_len, where + " (LH)")}</measure>'
        )

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>{piece["title"]}</work-title></work>
  <identification><creator type="composer">{piece["composer"]}</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
{chr(10).join(measures)}
  </part>
</score-partwise>
'''


out_dir = Path(__file__).resolve().parent.parent / 'samples'
out_dir.mkdir(exist_ok=True)
index = []
for piece in PIECES:
    file = f"{piece['id']}.musicxml"
    (out_dir / file).write_text(piece_xml(piece), encoding='utf-8')
    index.append({'id': f"sample-{piece['id']}", 'file': file, 'title': piece['title'], 'composer': piece['composer']})
    print(f"wrote {file} ({len(piece['rh'])} bars)")

(out_dir / 'index.json').write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('wrote index.json')
