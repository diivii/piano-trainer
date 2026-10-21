"""Search page for the PDMX piano catalog: search, preview and add pieces to
the built-in library from the browser (see tools/pdmx.py for the data).

Adding writes the score to samples/, rebuilds samples/index.json, commits just
those files and pushes, so the piece shows up on the live site (and the iPad)
a minute later. Only reachable from this computer.

Run: python tools/catalog.py [--no-push]   (or start-katalog.cmd)
     then open http://localhost:8020
"""
import argparse
import http.server
import json
import re
import subprocess
import sys
import threading
import time
from functools import partial
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pdmx

ROOT = pdmx.ROOT
PORT = 8020
PAGE_SIZE = 20
SEARCH_SECONDS = 3  # a broad search stops after this and offers "Mehr laden"

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--data', type=Path, default=pdmx.DATA, help='PDMX folder (default: ../PDMX)')
parser.add_argument('--no-push', action='store_true', help='add pieces without committing and pushing')
parser.add_argument('--port', type=int, default=PORT)
args = parser.parse_args()

print('Loading the catalog…')
ROWS = pdmx.load_catalog(args.data)
BY_MXL = {row['mxl']: row for row in ROWS}
adding = threading.Lock()


def in_library():
    """PDMX files already in the library (their 'source' starts with the path)."""
    return {o['source'].split(' ')[1] for o in pdmx.originals() if o.get('source', '').startswith('PDMX ')}


def search(query, start):
    words = query.split()
    if not words:
        return {'hits': [], 'next': None}
    listed = in_library()
    hits, next_start, deadline = [], None, time.monotonic() + SEARCH_SECONDS
    for pos, row in pdmx.find(args.data, ROWS, words, start):
        hits.append({key: row[key] for key in pdmx.COLUMNS} | {'inLibrary': row['mxl'] in listed})
        if len(hits) == PAGE_SIZE or time.monotonic() > deadline:
            next_start = pos + 1
            break
    return {'hits': hits, 'next': next_start}


def run(*command):
    done = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    output = (done.stdout + done.stderr).strip()
    if done.returncode:
        raise RuntimeError(f"{' '.join(command[:2])} failed:\n{output}")
    return output


def add(body):
    mxl, title, composer = body.get('mxl', ''), body.get('title', ''), body.get('composer', '')
    tempo = int(body['tempo']) if str(body.get('tempo') or '').isdigit() else None
    row = BY_MXL.get(mxl)
    if not row:
        raise ValueError('Diese Datei ist nicht im Katalog.')
    taken = {o['id']: o for o in pdmx.originals()}
    # Added before: replace it (keeps its id, so the app updates the piece in place).
    piece_id = next((o['id'] for o in taken.values() if o['source'].startswith(f'PDMX {mxl} ')), None)
    replaces = piece_id
    piece_id = piece_id or pdmx.slug(title)
    if not piece_id or not title.strip():
        raise ValueError('Bitte einen Titel eingeben.')
    # Titles must be unique in the library (the cards only show the title).
    index = json.loads((ROOT / 'samples' / 'index.json').read_text(encoding='utf-8'))
    if any(s['title'].casefold() == title.strip().casefold() and s['id'] != f'sample-{replaces}' for s in index):
        raise ValueError(f'Es gibt schon ein Stück mit dem Titel „{title.strip()}“. Bitte einen anderen Titel wählen.')
    if not replaces and (piece_id in taken or (ROOT / 'samples' / f'{piece_id}.musicxml').exists()):
        raise ValueError(f'Der Titel „{title.strip()}“ ist zu ähnlich zu einem vorhandenen Stück. Bitte einen anderen Titel wählen.')

    with adding:
        file = pdmx.add(args.data, mxl, piece_id, title, composer, tempo, row)
        log = [run(sys.executable, '-X', 'utf8', 'tools/make_samples.py').splitlines()[-1]]
        if args.no_push:
            log.append('Nicht veröffentlicht (--no-push).')
        else:
            paths = [f'samples/{file}', 'samples/index.json', 'tools/originals.json']
            run('git', 'add', '--', *paths)
            run('git', 'commit', '-m', f'Add {title} ({composer}) from PDMX', '--', *paths)
            log.append(run('git', 'push') or 'Gepusht.')
    return {'ok': True, 'file': file, 'log': '\n'.join(log), 'published': not args.no_push}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == '/':
            self.send_response(302)
            self.send_header('Location', '/tools/catalog.html')
            self.end_headers()
        elif url.path == '/api/search':
            start = int(query['start']) if query.get('start', '').isdigit() else 0
            self.send_json(search(query.get('q', ''), start))
        elif url.path == '/api/score':
            if query.get('mxl') not in BY_MXL:
                return self.send_json({'error': 'Nicht im Katalog.'}, 404)
            body = pdmx.musicxml_from_mxl(args.data / query['mxl']).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/xml; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != '/api/add':
            return self.send_json({'error': 'Unbekannt.'}, 404)
        try:
            length = int(self.headers.get('Content-Length', 0))
            self.send_json(add(json.loads(self.rfile.read(length) or b'{}')))
        except (ValueError, RuntimeError) as err:
            self.send_json({'error': str(err)}, 400)

    def log_message(self, format, *items):
        if not re.match(r'"GET /(api/score|vendor|js|css)', format % items):
            super().log_message(format, *items)


class Server(http.server.ThreadingHTTPServer):
    # On Windows, address reuse lets a second server share the port silently
    # (requests then go to either one); fail instead if it's taken.
    allow_reuse_address = False


try:
    server = Server(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
except OSError:
    sys.exit(f'Port {args.port} is in use: is the catalog already running? (--port picks another)')
with server:
    print(f'{len(ROWS)} pieces. Search page at http://localhost:{args.port}  (Ctrl+C to stop)'
          + ('  [--no-push]' if args.no_push else ''))
    server.serve_forever()
