"""Finds piano pieces in a local copy of PDMX and adds them as built-in samples.

PDMX (https://zenodo.org/records/15571083, CC BY 4.0) is a dataset of about
250,000 MuseScore scores marked public domain or CC0. Download PDMX.csv and
mxl.tar.gz into a folder next to this project (../PDMX) and unpack the archive
there (tar -xzf mxl.tar.gz), so the scores are in ../PDMX/mxl/.

  python tools/pdmx.py catalog            build ../PDMX/piano-catalog.csv (once)
  python tools/pdmx.py search für elise   search it, best rated first
  python tools/pdmx.py add ./mxl/1/11/Qm....mxl --id fuer-elise-original \\
      --title "Für Elise" --composer "L. v. Beethoven"
                                          copy a score into samples/ and list it
                                          in tools/originals.json
                                          (--tempo 60 fixes a wrong first tempo)

Then run tools/make_samples.py to rebuild samples/index.json. The search page
(tools/catalog.py) does search, preview and adding in the browser.

The catalog only keeps scores that are solo piano (every track a piano), have
no lyrics, are public domain or CC0, and have no license conflict between the
MuseScore website and the file (PDMX's license_conflict column). Search and
add also check the file itself: one part on two staves.
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT.parent / 'PDMX'
ORIGINALS = ROOT / 'tools' / 'originals.json'
FREE = {'publicdomain', 'cc-zero'}
COLUMNS = ['mxl', 'title', 'composer', 'rating', 'n_ratings', 'n_views', 'bars', 'notes_per_bar',
           'seconds', 'license', 'license_url']


def catalog(data):
    csv.field_size_limit(10**9)
    rows = []
    with open(data / 'PDMX.csv', encoding='utf-8', newline='') as f:
        for row in csv.DictReader(f):
            programs = row['tracks'].split('-') if row['tracks'] not in ('', 'NA') else []
            if (row['license'] not in FREE or row['license_conflict'] != 'False'
                    or row['has_lyrics'] == 'True' or row['is_draft'] == 'True'
                    or row['mxl'] in ('', 'NA') or not programs or any(p != '0' for p in programs)
                    or len(programs) > 2):
                continue
            composer = row['composer_name'] if row['composer_name'] != 'NA' else row['artist_name']
            rows.append({
                'mxl': row['mxl'],
                'title': row['title'],
                'composer': '' if composer == 'NA' else composer,
                'rating': row['rating'],
                'n_ratings': row['n_ratings'],
                'n_views': row['n_views'],
                'bars': row['song_length.bars'],
                'notes_per_bar': f"{float(row['notes_per_bar'] or 0):.1f}",
                'seconds': f"{float(row['song_length.seconds'] or 0):.0f}",
                'license': row['license'],
                'license_url': row['license_url'],
            })
    rows.sort(key=popularity, reverse=True)
    with open(data / 'piano-catalog.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} piano pieces -> {data / "piano-catalog.csv"}')


def popularity(row):
    """Rough popularity: views, with well rated scores first."""
    rating = float(row['rating'] or 0)
    return (int(row['n_ratings'] or 0) > 0 and rating >= 4, int(row['n_views'] or 0))


def load_catalog(data):
    with open(data / 'piano-catalog.csv', encoding='utf-8', newline='') as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row['text'] = plain(f"{row['title']} {row['composer']}")
    return rows


def plain(text):
    """Lowercase ASCII only: many PDMX titles have broken umlauts (Tr?umerei)."""
    return ''.join(c for c in text.lower() if c.isascii())


def find(data, rows, words, start=0):
    """Yields (position, row) of real piano scores matching all words, from rows[start:]."""
    words = [plain(w) for w in words]
    for i in range(start, len(rows)):
        row = rows[i]
        if all(w in row['text'] for w in words) and is_grand_staff(data / row['mxl']):
            yield i, row


def is_grand_staff(path):
    """One part on two staves: a real piano score, not a melody line."""
    try:
        xml = musicxml_from_mxl(path)
    except (OSError, KeyError, zipfile.BadZipFile, StopIteration, ElementTree.ParseError, UnicodeDecodeError):
        return False
    return len(re.findall(r'<score-part[ >]', xml)) == 1 and '<staves>2</staves>' in xml


def musicxml_from_mxl(path):
    """The score inside a compressed .mxl (a zip with META-INF/container.xml)."""
    with zipfile.ZipFile(path) as z:
        container = ElementTree.fromstring(z.read('META-INF/container.xml'))
        rootfile = next(el.get('full-path') for el in container.iter() if el.tag.endswith('rootfile'))
        return z.read(rootfile).decode('utf-8')


def slug(text):
    """'Prélude e-Moll Nr. 4' -> 'prelude-e-moll-nr-4'"""
    text = unicodedata.normalize('NFKD', text.replace('ß', 'ss')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def originals():
    return json.loads(ORIGINALS.read_text(encoding='utf-8')) if ORIGINALS.exists() else []


def add(data, mxl, piece_id, title, composer, tempo=None, row=None):
    """Copies a catalog score into samples/ and lists it in originals.json.
    Raises ValueError if it can't be added. Returns the file name."""
    if not re.fullmatch(r'[a-z0-9-]+', piece_id):
        raise ValueError('id: only a-z, 0-9 and -')
    if not title.strip() or not composer.strip():
        raise ValueError('title and composer are needed')
    if row is None:
        row = next((r for r in load_catalog(data) if r['mxl'] == mxl), None)
    if not row:
        raise ValueError(f'{mxl} is not in the piano catalog (not free, or not solo piano)')
    if not is_grand_staff(data / mxl):
        raise ValueError(f'{mxl} is not a two-staff piano score')
    xml = musicxml_from_mxl(data / mxl)
    if tempo:  # some scores start with a wrong tempo; the app shows the first one
        xml = re.sub(r'(<sound tempo=")[^"]*', lambda m: m.group(1) + str(tempo), xml, count=1)
        xml = re.sub(r'(<per-minute>)[^<]*', lambda m: m.group(1) + str(tempo), xml, count=1)
    file = f'{piece_id}.musicxml'
    (ROOT / 'samples' / file).write_text(xml, encoding='utf-8')

    listed = [o for o in originals() if o['id'] != piece_id]
    listed.append({
        'id': piece_id, 'file': file, 'title': title.strip(), 'composer': composer.strip(),
        'source': f"PDMX {mxl} ({row['title']})", 'license': row['license_url'],
    })
    ORIGINALS.write_text(json.dumps(listed, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return file


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')  # titles and the star on a Windows console
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--data', type=Path, default=DATA, help='PDMX folder (default: ../PDMX)')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('catalog')
    p = sub.add_parser('search')
    p.add_argument('words', nargs='+')
    p.add_argument('--limit', type=int, default=15)
    p = sub.add_parser('add')
    p.add_argument('mxl')
    p.add_argument('--id', required=True)
    p.add_argument('--title', required=True)
    p.add_argument('--composer', required=True)
    p.add_argument('--tempo', type=int, help='replace the first tempo of the score (BPM)')
    args = parser.parse_args()

    if args.command == 'catalog':
        catalog(args.data)
    elif args.command == 'search':
        for shown, (_, r) in enumerate(find(args.data, load_catalog(args.data), args.words)):
            if shown == args.limit:
                break
            print(f"{r['mxl']}\n    {r['title']} | {r['composer']} | {r['bars']} Takte, "
                  f"{r['notes_per_bar']} Noten/Takt | {r['rating']}★ ({r['n_ratings']}) | {r['n_views']} Aufrufe")
    else:
        try:
            file = add(args.data, args.mxl, args.id, args.title, args.composer, args.tempo)
        except ValueError as err:
            sys.exit(str(err))
        print(f'wrote samples/{file}; now run tools/make_samples.py')
