"""Local static server that tells the browser not to cache anything.

`py -m http.server` sends no Cache-Control, so browsers may reuse old HTML/JS
for a while after a change. This one sends `Cache-Control: no-store`.

Usage (from the repo root):  py scripts/dev-server.py [port]   (default 5500)
"""

import contextlib
import os
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Server(ThreadingHTTPServer):
    # The stdlib default (True) lets a second server bind the same port on
    # Windows, and requests then go to either one at random.
    allow_reuse_address = False
    # Listen on IPv6 and IPv4 at once (like `py -m http.server`), so another
    # server on the same port is detected whichever family it uses.
    address_family = socket.AF_INET6

    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PORT", 5500))
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with Server(("", port), handler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{port}/ (no cache)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
