"""Static dev server that never caches (so a plain reload always picks up edited modules and models).

    python tools/devserver.py [port]          # default 8000, serves the repo root
"""
import functools, http.server, sys
from pathlib import Path

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = Path(__file__).resolve().parent.parent
    handler = functools.partial(NoCache, directory=str(root))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as srv:
        print(f'Refillit dev server: http://127.0.0.1:{port}')
        srv.serve_forever()
