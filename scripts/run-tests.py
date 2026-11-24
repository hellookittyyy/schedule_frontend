"""Run the browser test page headlessly and check its result marker.

Starts scripts/dev-server.py on a free port, opens /tests/ in headless Chrome (or
Edge), reads the dumped DOM and prints the <pre id="test-summary"> marker.

Usage (from the repo root):  py scripts/run-tests.py
Set CHROME_BIN to use a specific Chrome/Edge/Chromium executable.
Exit code 0 only for PASS with passed == total and total > 0.
"""

import html
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = re.compile(r'<pre id="test-summary">(.*?)</pre>', re.DOTALL)
RESULT = re.compile(r'^(PASS|FAIL)\s+(\d+)/(\d+)')

CHROME_PATHS = [
    Path(r"C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path(r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def find_browser() -> Path | None:
    env = os.environ.get("CHROME_BIN")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    for p in CHROME_PATHS:
        if p.is_file():
            return p
    return None


def stop(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def main() -> int:
    browser = find_browser()
    if browser is None:
        print("No browser found. Set CHROME_BIN to chrome.exe (or msedge.exe).", file=sys.stderr)
        return 1

    port = free_port()
    url = f"http://127.0.0.1:{port}/tests/"
    print(f"Testing {url}")

    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "scripts" / "dev-server.py"), str(port)],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    tmp = None
    try:
        deadline = time.monotonic() + 15
        ready = False
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            try:
                with urllib.request.urlopen(url, timeout=1) as r:
                    if r.status == 200:
                        ready = True
                        break
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.1)

        if not ready:
            # Terminate first: reading the pipe blocks until EOF, i.e. until the child exits.
            stop(proc)
            err = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
            print("Server did not answer at " + url, file=sys.stderr)
            if err:
                print(err, file=sys.stderr)
            return 1

        tmp = tempfile.mkdtemp(prefix="schedule-tests-")
        cmd = [
            str(browser),
            "--headless=new",
            "--disable-gpu",
            "--virtual-time-budget=15000",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--user-data-dir=" + tmp,
            "--dump-dom",
            url,
        ]
        try:
            out = subprocess.run(cmd, capture_output=True, timeout=90).stdout
        except subprocess.TimeoutExpired:
            print("Browser timed out after 90 s", file=sys.stderr)
            return 1
        dom = out.decode("utf-8", errors="replace")

        m = MARKER.search(dom)
        if not m:
            print("no test summary marker")
            print(dom[-2000:])
            return 1

        text = html.unescape(m.group(1))
        print(text)
        first = RESULT.match(text)
        if not first:
            return 1
        ok = first.group(1) == "PASS" and first.group(2) == first.group(3) and int(first.group(3)) > 0
        return 0 if ok else 1
    finally:
        stop(proc)
        if proc.stderr:
            proc.stderr.close()
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
