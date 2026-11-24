"""Fill docs/test-checklist.html with the checks from docs/test-cases.md.

The markdown is the source: tables `| ID | do | expect | [ ] |` and lines `- [ ] text`
under `## N.` sections (`###` / `**bold**` lines start a group). Sections without any
check (setup, glossary, bug template) are skipped. The HTML keeps its own code; only
the block between /*DATA*/ and /*END DATA*/ is replaced.

Usage (from the repo root):  py scripts/build-test-checklist.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "test-cases.md"
OUT = ROOT / "docs" / "test-checklist.html"
WARN = "⚠️"


def cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse(text: str) -> list[dict]:
    sections: list[dict] = []
    sec = grp = None
    prefix, n = "", 0
    in_code = False

    def new_group(title: str) -> dict:
        g = {"title": title, "items": []}
        sec["groups"].append(g)
        return g

    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^## (\d+)\.\s*(.+)$", line)
        if m:
            sec = {"title": m.group(2), "groups": []}
            sections.append(sec)
            grp = new_group("")
            # Short prefixes for plain checklist lines, which have no number of their own.
            prefix = {"3": "Ш", "7": "Зд"}.get(m.group(1), "Ч" + m.group(1))
            n = 0
            continue
        if sec is None:
            continue
        m = re.match(r"^###\s+(.+)$", line)
        if m:
            grp = new_group(m.group(1))
            continue
        m = re.match(r"^\*\*(Сценарій\s+(\S+)\..*)\*\*$", line)
        if m:
            grp = new_group(m.group(1))
            prefix, n = "Сц" + m.group(2), 0
            continue
        m = re.match(r"^- \[ \]\s+(?:\d+\.\s*)?(.+)$", line)
        if m:
            n += 1
            body = m.group(1)
            grp["items"].append({"id": f"{prefix}-{n}", "do": body.replace(WARN, "").strip(), "warn": WARN in body})
            continue
        if line.startswith("|") and line.rstrip().endswith("[ ] |"):
            c = cells(line)
            if len(c) != 4:
                continue
            ident = c[0]
            grp["items"].append({
                "id": ident.replace(WARN, "").strip(),
                "do": c[1],
                "expect": c[2],
                "warn": WARN in ident,
            })

    out = []
    for s in sections:
        s["groups"] = [g for g in s["groups"] if g["items"]]
        if s["groups"]:
            out.append(s)
    return out


def main() -> int:
    sections = parse(SRC.read_text(encoding="utf-8"))
    ids = [it["id"] for s in sections for g in s["groups"] for it in g["items"]]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        print("duplicate ids in test-cases.md:", ", ".join(dupes))
        return 1
    html = OUT.read_text(encoding="utf-8")
    data = "var DATA = " + json.dumps({"sections": sections}, ensure_ascii=False, indent=1) + ";"
    new, count = re.subn(r"/\*DATA\*/.*?/\*END DATA\*/", lambda _: "/*DATA*/\n" + data + "\n/*END DATA*/", html, flags=re.DOTALL)
    if count != 1:
        print("marker /*DATA*/ … /*END DATA*/ not found in", OUT)
        return 1
    OUT.write_text(new, encoding="utf-8")
    print(f"{len(ids)} checks in {len(sections)} sections -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
