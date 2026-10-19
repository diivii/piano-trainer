"""Generates samples/ode-to-joy.musicxml: a simple two-hand arrangement
(melody in the right hand, two-note chords in the left hand).

Run: python tools/make_sample.py
"""
from pathlib import Path

DIVISIONS = 2  # per quarter note -> eighth = 1
DUR = {'e': (1, 'eighth', False), 'q': (2, 'quarter', False), 'q.': (3, 'quarter', True),
       'h': (4, 'half', False), 'w': (8, 'whole', False)}

# Right hand: one string per bar, "pitch:duration".
RH = [
    'E4:q E4:q F4:q G4:q', 'G4:q F4:q E4:q D4:q', 'C4:q C4:q D4:q E4:q', 'E4:q. D4:e D4:h',
    'E4:q E4:q F4:q G4:q', 'G4:q F4:q E4:q D4:q', 'C4:q C4:q D4:q E4:q', 'D4:q. C4:e C4:h',
    'D4:q D4:q E4:q C4:q', 'D4:q E4:e F4:e E4:q C4:q', 'D4:q E4:e F4:e E4:q D4:q', 'C4:q D4:q G3:h',
    'E4:q E4:q F4:q G4:q', 'G4:q F4:q E4:q D4:q', 'C4:q C4:q D4:q E4:q', 'D4:q. C4:e C4:h',
]

# Left hand: chords joined with "+".
C, G = 'C3+G3', 'G2+D3'
LH = [
    f'{C}:w', f'{G}:w', f'{C}:w', f'{G}:w',
    f'{C}:w', f'{G}:w', f'{C}:w', f'{G}:h {C}:h',
    f'{G}:w', f'{C}:w', f'{G}:w', f'{C}:h {G}:h',
    f'{C}:w', f'{G}:w', f'{C}:w', f'{G}:h {C}:h',
]


def note_xml(pitch, dur, staff, voice, chord=False):
    step, octave = pitch[0], pitch[1:]
    duration, typ, dotted = DUR[dur]
    return (
        '<note>' + ('<chord/>' if chord else '')
        + f'<pitch><step>{step}</step><octave>{octave}</octave></pitch>'
        + f'<duration>{duration}</duration><voice>{voice}</voice><type>{typ}</type>'
        + ('<dot/>' if dotted else '')
        + f'<staff>{staff}</staff></note>'
    )


def bar_xml(bar, staff, voice):
    out = []
    for token in bar.split():
        pitches, dur = token.split(':')
        for i, p in enumerate(pitches.split('+')):
            out.append(note_xml(p, dur, staff, voice, chord=i > 0))
    return ''.join(out)


measures = []
for i, (rh, lh) in enumerate(zip(RH, LH), start=1):
    attrs = ''
    if i == 1:
        attrs = (
            f'<attributes><divisions>{DIVISIONS}</divisions><key><fifths>0</fifths></key>'
            '<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>'
            '<clef number="1"><sign>G</sign><line>2</line></clef>'
            '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
        )
    measures.append(
        f'<measure number="{i}">{attrs}{bar_xml(rh, 1, 1)}'
        f'<backup><duration>{4 * DIVISIONS}</duration></backup>{bar_xml(lh, 2, 5)}</measure>'
    )

xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Ode to Joy</work-title></work>
  <identification><creator type="composer">L. v. Beethoven (simple arrangement)</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
{chr(10).join(measures)}
  </part>
</score-partwise>
'''

out = Path(__file__).resolve().parent.parent / 'samples' / 'ode-to-joy.musicxml'
out.parent.mkdir(exist_ok=True)
out.write_text(xml, encoding='utf-8')
print(f'wrote {out}')
