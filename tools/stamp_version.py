"""Stamps a version into the site before it is published, so browsers load
fresh files after every update instead of cached ones (GitHub Pages lets
browsers cache files for 10 minutes).

- writes version.json, which index.html fetches uncached on every start
- adds ?v=<version> to every relative import in js/*.js, so each module of
  a new version has a new address

index.html adds the version to app.html, the stylesheet and js/main.js itself.
Run by the GitHub Actions deploy workflow; not meant for the working copy.

Run: python tools/stamp_version.py <version>
"""
import json
import re
import sys
from pathlib import Path

version = sys.argv[1]
if not re.fullmatch(r'[\w.-]+', version):
    sys.exit(f'invalid version {version!r}')

root = Path(__file__).resolve().parent.parent
(root / 'version.json').write_text(json.dumps({'version': version}) + '\n', encoding='utf-8')

# from './x.js'  /  import './x.js'  /  import('./x.js')
IMPORT = re.compile(r"""((?:\bfrom|\bimport)\s*\(?\s*['"])(\.{1,2}/[\w./-]+\.js)(\?v=[\w.-]+)?(['"])""")
total = 0
for path in sorted((root / 'js').glob('*.js')):
    text = path.read_text(encoding='utf-8')
    stamped, n = IMPORT.subn(lambda m: f'{m[1]}{m[2]}?v={version}{m[4]}', text)
    path.write_text(stamped, encoding='utf-8')
    total += n
    print(f'{path.name}: {n} imports')
print(f'version {version}: {total} imports stamped')
