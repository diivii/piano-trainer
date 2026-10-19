"""Local dev server for Piano Trainer.

Like `python -m http.server`, but tells the browser not to cache, so a refresh
always picks up the latest code.

Run: python tools/serve.py [port]
"""
import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


handler = partial(NoCacheHandler, directory=str(ROOT))
with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as server:
    print(f'Piano Trainer running at http://localhost:{PORT}  (Ctrl+C to stop)')
    server.serve_forever()
