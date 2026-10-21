"""Generates the built-in sample pieces as MusicXML in samples/, plus
samples/index.json listing them (the app adds these to the library).

All melodies are public domain (traditional, or composers long dead); the
left-hand parts are simple accompaniments written for practice.

Notation per bar: space-separated "pitch:duration" tokens.
  pitch:    C4, F#5, Bb3 ... ; chords joined with "+" (C3+G3); r = rest
  duration: s = sixteenth, e = eighth, e. = dotted eighth, q = quarter,
            q. = dotted quarter, h = half, h. = dotted half, w = whole
Pickups (upbeats) are written as a full first bar starting with rests.

Original scores taken from PDMX by tools/pdmx.py are listed in
tools/originals.json; their files in samples/ are not generated here, only
added to the index.

Run: python tools/make_samples.py
"""
import json
import re
from pathlib import Path

DIVISIONS = 4  # per quarter note -> sixteenth = 1
DUR = {
    's': (1, '16th', False), 'e': (2, 'eighth', False), 'e.': (3, 'eighth', True),
    'q': (4, 'quarter', False), 'q.': (6, 'quarter', True),
    'h': (8, 'half', False), 'h.': (12, 'half', True), 'w': (16, 'whole', False),
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
    {
        'id': 'alle-meine-entchen',
        'title': 'Alle meine Entchen',
        'composer': 'Volkslied (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 100,
        'rh': ['C4:q D4:q E4:q F4:q', 'G4:h G4:h', 'A4:q A4:q A4:q A4:q', 'G4:w',
               'A4:q A4:q A4:q A4:q', 'G4:w', 'F4:q F4:q F4:q F4:q', 'E4:h E4:h',
               'D4:q D4:q D4:q D4:q', 'C4:w'],
        'lh': ['C3:w', 'C3:w', 'F2:w', 'C3:w', 'F2:w', 'C3:w', 'F2:w', 'C3:w', 'G2:w', 'C3:w'],
    },
    {
        'id': 'haenschen-klein',
        'title': 'Hänschen klein',
        'composer': 'Volkslied (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 100,
        'rh': ['G4:q E4:q E4:h', 'F4:q D4:q D4:h', 'C4:q D4:q E4:q F4:q', 'G4:q G4:q G4:h',
               'G4:q E4:q E4:h', 'F4:q D4:q D4:h', 'C4:q E4:q G4:q G4:q', 'C4:w',
               'D4:q D4:q D4:q D4:q', 'D4:q E4:q F4:h', 'E4:q E4:q E4:q E4:q', 'E4:q F4:q G4:h',
               'G4:q E4:q E4:h', 'F4:q D4:q D4:h', 'C4:q E4:q G4:q G4:q', 'C4:w'],
        'lh': ['C3:w', 'G2:w', 'C3:w', 'C3:w', 'C3:w', 'G2:w', 'C3:h G2:h', 'C3:w',
               'G2:w', 'G2:w', 'C3:w', 'C3:w', 'C3:w', 'G2:w', 'C3:h G2:h', 'C3:w'],
    },
    {
        'id': 'happy-birthday',
        'title': 'Happy Birthday',
        'composer': 'M. J. und P. S. Hill (einfache Bearbeitung)',
        'time': (3, 4), 'key': 0, 'tempo': 100,
        'rh': ['r:h G3:e. G3:s', 'A3:q G3:q C4:q', 'B3:h G3:e. G3:s', 'A3:q G3:q D4:q',
               'C4:h G3:e. G3:s', 'G4:q E4:q C4:q', 'B3:q A3:q F4:e. F4:s', 'E4:q C4:q D4:q', 'C4:h.'],
        'lh': ['r:h.', f'{C}:h.', f'{G}:h.', f'{G}:h.', f'{C}:h.', f'{C}:h.', f'{F}:h.', f'{G}:h.', f'{C}:h.'],
    },
    {
        'id': 'kanon-in-d',
        'title': 'Kanon in D (Thema)',
        'composer': 'J. Pachelbel (einfache Bearbeitung)',
        'time': (4, 4), 'key': 2, 'tempo': 70,
        'rh': ['F#5:h E5:h', 'D5:h C#5:h', 'B4:h A4:h', 'B4:h C#5:h',
               'F#5+A5:h E5+A5:h', 'D5+F#5:h C#5+E5:h', 'B4+D5:h A4+C#5:h', 'B4+D5:h C#5+E5:h',
               'D5+F#5:w'],
        'lh': ['D3:h A2:h', 'B2:h F#2:h', 'G2:h D2:h', 'G2:h A2:h',
               'D3:h A2:h', 'B2:h F#2:h', 'G2:h D2:h', 'G2:h A2:h', 'D2+D3:w'],
    },
    {
        'id': 'when-the-saints',
        'title': 'When the Saints Go Marching In',
        'composer': 'Spiritual (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 110,
        'rh': ['r:q C4:q E4:q F4:q', 'G4:w', 'r:q C4:q E4:q F4:q', 'G4:w',
               'r:q C4:q E4:q F4:q', 'G4:h E4:h', 'C4:h E4:h', 'D4:w',
               'r:q E4:q E4:q D4:q', 'C4:h. C4:q', 'E4:q G4:q G4:q G4:q', 'F4:w',
               'r:q C4:q E4:q F4:q', 'G4:h E4:h', 'C4:h D4:h', 'C4:w'],
        'lh': ['r:w', f'{C}:w', f'{C}:w', f'{C}:w', f'{C}:w', f'{C}:w', f'{C}:w', f'{G}:w',
               f'{G}:w', f'{C}:w', f'{C}:w', f'{F}:w', f'{F}:w', f'{C}:w', f'{C}:h {G}:h', f'{C}:w'],
    },
    {
        'id': 'stille-nacht',
        'title': 'Stille Nacht',
        'composer': 'F. X. Gruber (einfache Bearbeitung)',
        'time': (6, 8), 'key': 0, 'tempo': 90,
        'rh': ['G4:q. A4:e G4:q', 'E4:h.', 'G4:q. A4:e G4:q', 'E4:h.',
               'D5:h D5:q', 'B4:h.', 'C5:h C5:q', 'G4:h.',
               'A4:h A4:q', 'C5:q. B4:e A4:q', 'G4:q. A4:e G4:q', 'E4:h.',
               'A4:h A4:q', 'C5:q. B4:e A4:q', 'G4:q. A4:e G4:q', 'E4:h.',
               'D5:h D5:q', 'F5:q. D5:e B4:q', 'C5:h.', 'E5:h.',
               'C5:q. G4:e E4:q', 'G4:q. F4:e D4:q', 'C4:h.'],
        'lh': [f'{C}:h.', f'{C}:h.', f'{C}:h.', f'{C}:h.', f'{G}:h.', f'{G}:h.', f'{C}:h.', f'{C}:h.',
               f'{F}:h.', f'{F}:h.', f'{C}:h.', f'{C}:h.', f'{F}:h.', f'{F}:h.', f'{C}:h.', f'{C}:h.',
               f'{G}:h.', f'{G}:h.', f'{C}:h.', f'{C}:h.', f'{C}:h.', f'{G}:h.', f'{C}:h.'],
    },
    {
        'id': 'gymnopedie-1',
        'title': 'Gymnopédie Nr. 1 (Anfang)',
        'composer': 'E. Satie (vereinfacht)',
        'time': (3, 4), 'key': 2, 'tempo': 72,
        'rh': ['r:h.'] * 4 + [
            'F#5:q A5:q G5:q', 'F#5:q C#5:q B4:q', 'C#5:q D5:q A4:q', 'F#4:h.', 'r:h.', 'r:h.', 'r:h.', 'r:h.',
            'F#5:q A5:q G5:q', 'F#5:q C#5:q B4:q', 'C#5:q D5:q A4:q', 'F#4:h.', 'r:h.', 'r:h.'],
        'lh': ['G2:q B3+D4+F#4:h', 'D2:q A3+C#4+F#4:h'] * 9,
    },
    {
        'id': 'halle-des-bergkoenigs',
        'title': 'In der Halle des Bergkönigs',
        'composer': 'E. Grieg (vereinfacht)',
        'time': (4, 4), 'key': 0, 'tempo': 120,
        'rh': ['A4:e B4:e C5:e D5:e E5:e C5:e E5:q', 'D#5:e B4:e D#5:q D5:e Bb4:e D5:q',
               'A4:e B4:e C5:e D5:e E5:e C5:e E5:e A5:e', 'G5:e E5:e C5:e E5:e G5:h'] * 2,
        'lh': ['A2:q E3:q A2:q E3:q', 'B2:q F#3:q Bb2:q F3:q', 'A2:q E3:q A2:q E3:q', 'C3:q G3:q C3:h',
               'A2:q E3:q A2:q E3:q', 'B2:q F#3:q Bb2:q F3:q', 'A2:q E3:q A2:q E3:q', 'E2:q B2:q A2:h'],
    },
    {
        'id': 'wiegenlied',
        'title': "Wiegenlied (Guten Abend, gut' Nacht)",
        'composer': 'J. Brahms (einfache Bearbeitung)',
        'time': (3, 4), 'key': 0, 'tempo': 80,
        'rh': ['r:h E4:e E4:e', 'G4:h E4:e E4:e', 'G4:h E4:e G4:e', 'C5:q B4:q. A4:e', 'A4:q G4:q D4:e E4:e',
               'F4:q D4:q D4:e E4:e', 'F4:h D4:e F4:e', 'B4:e A4:e G4:q B4:q', 'C5:h.'],
        'lh': ['r:h.', f'{C}:h.', f'{C}:h.', 'G2+F3:h.', f'{C}:h.', f'{G}:h.', 'G2+F3:h.', f'{G}:h.', f'{C}:h.'],
    },
    {
        'id': 'largo-neue-welt',
        'title': 'Largo (Aus der Neuen Welt)',
        'composer': 'A. Dvořák (einfache Bearbeitung)',
        'time': (4, 4), 'key': 0, 'tempo': 60,
        'rh': ['E4:q. G4:e G4:h', 'E4:q. D4:e C4:h', 'D4:q E4:q G4:q E4:q', 'D4:w',
               'E4:q. G4:e G4:h', 'E4:q. D4:e C4:h', 'D4:q E4:q D4:h', 'C4:w'],
        'lh': [f'{C}:w', f'{C}:w', f'{F}:h {C}:h', f'{G}:w', f'{C}:w', f'{C}:w', f'{G}:w', f'{C}:w'],
    },
    {
        'id': 'morgenstimmung',
        'title': 'Morgenstimmung',
        'composer': 'E. Grieg (einfache Bearbeitung)',
        'time': (6, 8), 'key': 0, 'tempo': 120,
        'rh': ['G4:q E4:e D4:q C4:e', 'D4:q E4:e G4:q E4:e', 'D4:q C4:e D4:q E4:e', 'D4:q E4:e G4:q E4:e',
               'G4:q A4:e E4:q A4:e', 'G4:q E4:e D4:q C4:e', 'C4:h.'],
        'lh': [f'{C}:h.', f'{C}:h.', f'{C}:h.', f'{C}:h.', f'{F}:h.', f'{G}:h.', f'{C}:h.'],
    },
    {
        'id': 'kleine-nachtmusik',
        'title': 'Eine kleine Nachtmusik (Anfang)',
        'composer': 'W. A. Mozart (einfache Bearbeitung)',
        'time': (4, 4), 'key': 1, 'tempo': 110,
        'rh': ['G4:q r:e D4:e G4:q r:e D4:e', 'G4:e D4:e G4:e B4:e D5:q r:q',
               'C5:q r:e A4:e C5:q r:e A4:e', 'C5:e A4:e F#4:e A4:e D4:q r:q'] * 2,
        'lh': [f'{G}:w', f'{G}:w', 'D3+A3:w', 'D3+A3:h D3:h'] * 2,
    },
    {
        'id': 'sonate-kv545',
        'title': 'Sonate C-Dur KV 545 (Anfang)',
        'composer': 'W. A. Mozart (vereinfacht)',
        'time': (4, 4), 'key': 0, 'tempo': 90,
        'rh': ['C5:h E5:q G5:q', 'B4:q. C5:s D5:s C5:h', 'A5:h G5:q C6:q', 'G5:q F5:e E5:e F5:q E5:q',
               'A4:e B4:e C5:e D5:e E5:e F5:e G5:e A5:e', 'G5:e F5:e E5:e D5:e C5:e B4:e A4:e G4:e',
               'F4:e G4:e A4:e B4:e C5:e D5:e E5:e F5:e', 'E5:e D5:e C5:e B4:e C5:h'],
        'lh': ['C3+E3+G3:w', 'D3+F3+G3:h C3+E3+G3:h', 'C3+F3+A3:h C3+E3+G3:h', 'B2+D3+G3:h C3+E3+G3:h',
               f'{F}:w', f'{C}:w', f'{G}:w', 'G2+F3:h C3+E3+G3:h'],
    },
    {
        'id': 'praeludium-c-dur',
        'title': 'Präludium in C-Dur (Anfang)',
        'composer': 'J. S. Bach (vereinfacht)',
        'time': (4, 4), 'key': 0, 'tempo': 60,
        # Each bar: a held two-note chord in the left hand, the broken chord twice in the right.
        'rh': [f'r:e {a}:s {b}:s {c}:s {a}:s {b}:s {c}:s ' * 2 for a, b, c in [
            ('G4', 'C5', 'E5'), ('A4', 'D5', 'F5'), ('G4', 'D5', 'F5'), ('G4', 'C5', 'E5'),
            ('A4', 'E5', 'A5'), ('F#4', 'A4', 'D5'), ('G4', 'D5', 'G5'), ('E4', 'G4', 'C5'),
            ('E4', 'G4', 'C5'), ('D4', 'F#4', 'C5'), ('D4', 'G4', 'B4')]] + ['E4+G4+C5:w'],
        'lh': [f'{x}+{y}:h ' * 2 for x, y in [
            ('C4', 'E4'), ('C4', 'D4'), ('B3', 'D4'), ('C4', 'E4'),
            ('C4', 'E4'), ('C4', 'D4'), ('B3', 'D4'), ('B3', 'C4'),
            ('A3', 'C4'), ('D3', 'A3'), ('G3', 'B3')]] + ['C3+C4:w'],
    },
    {
        'id': 'fuer-elise',
        'title': 'Für Elise (Anfang)',
        'composer': 'L. v. Beethoven (vereinfacht)',
        'time': (3, 8), 'key': 0, 'tempo': 60,
        # The A section twice: first ending leads back with E–D#, second ends on A.
        'rh': ['r:q E5:s D#5:s'] + [
            'E5:s D#5:s E5:s B4:s D5:s C5:s', 'A4:e r:s C4:s E4:s A4:s', 'B4:e r:s E4:s G#4:s B4:s',
            'C5:e r:s E4:s E5:s D#5:s', 'E5:s D#5:s E5:s B4:s D5:s C5:s', 'A4:e r:s C4:s E4:s A4:s',
            'B4:e r:s E4:s C5:s B4:s'] * 2,
        'lh': ['r:q.'] + [
            'r:q.', 'A2:s E3:s A3:s r:s r:e', 'E2:s E3:s G#3:s r:s r:e',
            'A2:s E3:s A3:s r:s r:e', 'r:q.', 'A2:s E3:s A3:s r:s r:e',
            'E2:s E3:s G#3:s r:s r:e'] * 2,
    },
]
# Für Elise: put the endings after each pass of the A section.
_elise = next(p for p in PIECES if p['id'] == 'fuer-elise')
_elise['rh'][8:8] = ['A4:e r:e E5:s D#5:s']
_elise['rh'].append('A4:q.')
_elise['lh'][8:8] = ['A2:s E3:s A3:s r:s r:e']
_elise['lh'].append('A2+A3:q.')


def note_xml(pitch, dur, staff, voice, chord=False):
    duration, typ, dotted = DUR[dur]
    if pitch == 'r':
        return (f'<note><rest/><duration>{duration}</duration><voice>{voice}</voice><type>{typ}</type>'
                + ('<dot/>' if dotted else '') + f'<staff>{staff}</staff></note>')
    m = PITCH.match(pitch)
    if not m:
        raise ValueError(f'bad pitch {pitch!r}')
    step, accidental, octave = m.groups()
    alter = {'#': '<alter>1</alter>', 'b': '<alter>-1</alter>'}.get(accidental, '')
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
        raise ValueError(f'{where}: bar has {total} sixteenths, expected {expected}: {bar!r}')
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

originals = Path(__file__).resolve().parent / 'originals.json'
for piece in json.loads(originals.read_text(encoding='utf-8')) if originals.exists() else []:
    if not (out_dir / piece['file']).exists():
        raise SystemExit(f"{piece['file']} is missing (see tools/pdmx.py)")
    index.append({'id': f"sample-{piece['id']}", 'file': piece['file'], 'title': piece['title'], 'composer': piece['composer']})
    print(f"listed {piece['file']} (original from PDMX)")

(out_dir / 'index.json').write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('wrote index.json')
