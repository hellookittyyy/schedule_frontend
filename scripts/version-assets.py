"""Add a content hash (?v=xxxxxxxx) to every local CSS/JS URL in the app's HTML pages.

The browser then re-downloads a file only when its content changed, so after a
deploy nobody runs old cached JS/CSS against new HTML.

Usage (from the repo root):
    py scripts/version-assets.py          # rewrite the pages
    py scripts/version-assets.py --check  # exit 1 if any page is out of date

Run it before every commit that changes a file under assets/, js/ or admin/*.js|css.
"""

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"design", "docs", ".git", ".github", ".claude", "node_modules", "scripts"}

# src="..." / href="..." pointing to a local .js or .css, with an optional old ?v=.
REF = re.compile(r'(?P<attr>\b(?:src|href)=")(?P<path>[^"?#:]+\.(?:js|css))(?:\?v=[0-9a-f]*)?(?=")')


def pages():
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] not in SKIP_DIRS:
            yield p


def file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def resolve(page: Path, url: str) -> Path:
    if url.startswith("/"):
        return ROOT / url.lstrip("/")
    return page.parent / url


def process(page: Path) -> tuple[str, str, list[str]]:
    text = page.read_bytes().decode("utf-8")  # keep line endings as is
    missing = []

    def repl(m):
        target = resolve(page, m["path"])
        if not target.is_file():
            missing.append(m["path"])
            return m[0]
        return f'{m["attr"]}{m["path"]}?v={file_hash(target)}'

    return text, REF.sub(repl, text), missing


def main() -> int:
    check = "--check" in sys.argv[1:]
    stale, errors = [], []
    for page in pages():
        old, new, missing = process(page)
        rel = page.relative_to(ROOT).as_posix()
        errors += [f"{rel}: file not found: {m}" for m in missing]
        if old != new:
            stale.append(rel)
            if not check:
                page.write_bytes(new.encode("utf-8"))
    for e in errors:
        print("ERROR", e)
    if check:
        for s in stale:
            print("out of date:", s)
        if stale:
            print("Run: py scripts/version-assets.py")
    else:
        print(f"updated {len(stale)} page(s)")
    return 1 if errors or (check and stale) else 0


if __name__ == "__main__":
    sys.exit(main())
