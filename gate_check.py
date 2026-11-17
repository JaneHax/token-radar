#!/usr/bin/env python3
"""Check an entry against the seven gate rows token-radar-01 publishes.

The house's scorer is sealed, so this implements the rules' own words: the dashboard's file rules,
board.json's shape and ordering, watchlist coverage, farm steps, the screenshot caps, and the dossier
being exactly what the vendored library writes.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import PIL.Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
SNAP = json.loads((HERE / "input" / "snapshot.json").read_text())

PLAIN = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$")
TEXT_EXT = (".html", ".css", ".js", ".json", ".mjs", ".svg", ".md", ".txt")
failures: list[str] = []
passes: list[str] = []


def ok(name: str, detail: str) -> None:
    passes.append(f"pass  {name}: {detail}")


def bad(name: str, detail: str) -> None:
    failures.append(f"FAIL  {name}: {detail}")


# ---------------------------------------------------------------- 1. dashboard_files
dash = OUT / "dashboard"
if not dash.is_dir():
    bad("dashboard_files", "no dashboard/ directory")
else:
    files = [p for p in dash.rglob("*") if p.is_file() and not p.name.startswith(".")]
    names_ok = all(PLAIN.match(p.name) for p in files)
    dot_dirs = [p for p in dash.rglob("*") if p.is_dir() and p.name.startswith(".")]
    total = sum(p.stat().st_size for p in files)
    kinds = {p.suffix for p in files}
    has_html = any(p.name == "index.html" for p in files)
    problems = []
    if not has_html:
        problems.append("no index.html")
    if ".css" not in kinds:
        problems.append("no .css")
    if ".js" not in kinds:
        problems.append("no .js")
    if len(files) > 400:
        problems.append(f"{len(files)} files over 400")
    if total > 4 * 1024 * 1024:
        problems.append(f"{total} bytes over 4 MiB")
    if not names_ok:
        problems.append("a file name breaks the plain-name rule")
    if dot_dirs:
        problems.append(f"directory starting with a dot: {dot_dirs[0].name}")

    # No network address in an HTML attribute value, a <style> body, a CSS file, or a JS import.
    url = re.compile(r"https?://", re.I)
    for p in files:
        text = p.read_text(errors="ignore")
        if p.suffix == ".html":
            for m in re.finditer(r"<[^>]+>", text):
                tag = m.group(0)
                for attr in re.finditer(r'=\s*["\']([^"\']*)["\']', tag):
                    if url.search(attr.group(1)):
                        problems.append(f"{p.name}: an attribute names {attr.group(1)[:40]}")
            for m in re.finditer(r"<style[^>]*>(.*?)</style>", text, re.S):
                if url.search(m.group(1)):
                    problems.append(f"{p.name}: a <style> body names a URL")
        if p.suffix == ".css" and url.search(text):
            problems.append(f"{p.name}: the CSS names a URL")
        if p.suffix in (".js", ".mjs"):
            for m in re.finditer(r"(?:^|[;\s])(?:import|export)\s[^;]*?from\s*['\"]([^'\"]+)['\"]", text):
                if url.search(m.group(1)):
                    problems.append(f"{p.name}: an import names {m.group(1)[:40]}")
            for m in re.finditer(r"(?:require|import)\s*\(\s*['\"]([^'\"]+)['\"]", text):
                if url.search(m.group(1)):
                    problems.append(f"{p.name}: a dynamic import names {m.group(1)[:40]}")

    if problems:
        bad("dashboard_files", "; ".join(problems))
    else:
        ok("dashboard_files", f"{len(files)} files, {total / 1024:.0f} KB, {sorted(kinds)}")

# ---------------------------------------------------------------- 2/3/4/5. board
board_path = OUT / "board.json"
if not board_path.exists():
    bad("board_file", "no board.json")
else:
    raw = board_path.read_bytes()
    doc = json.loads(raw)
    rows = doc["rows"] if isinstance(doc, dict) else doc
    slugs = {p["slug"] for p in SNAP["protocols"]}
    problems = []
    if not (100 <= len(rows) <= 4000):
        problems.append(f"{len(rows)} rows, the gate wants 100..4000")
    if len(raw) > 8 * 1024 * 1024:
        problems.append(f"{len(raw)} bytes over 8 MiB")
    seen = set()
    for r in rows:
        s = r.get("slug")
        if s not in slugs:
            problems.append(f"slug {s!r} is not in the snapshot")
            break
        if s in seen:
            problems.append(f"{s} appears twice")
            break
        seen.add(s)
        if not isinstance(r.get("name"), str) or not r["name"]:
            problems.append(f"{s}: name")
            break
        if not isinstance(r.get("rank"), int) or r["rank"] < 1:
            problems.append(f"{s}: rank")
            break
        v = r.get("implied_value_usd")
        if not isinstance(v, int) or v < 1 or v > 100_000_000_000_000:
            problems.append(f"{s}: implied_value_usd {v!r}")
            break
        steps = r.get("farm_steps")
        if not isinstance(steps, list) or not (3 <= len(steps) <= 12):
            problems.append(f"{s}: {len(steps) if isinstance(steps, list) else 'no'} farm steps")
            break
        short = [x for x in steps if not (20 <= len(x.strip()) <= 600)]
        if short:
            problems.append(f"{s}: a farm step of {len(short[0].strip())} characters")
            break
    if problems:
        bad("board_file", "; ".join(problems))
        bad("farm_steps", "see board_file")
    else:
        ok("board_file", f"{len(rows)} rows, {len(raw) / 1024:.0f} KB")
        lengths = [len(x.strip()) for r in rows for x in r["farm_steps"]]
        ok("farm_steps", f"{len(lengths)} steps, {min(lengths)}..{max(lengths)} characters")

    ranks = sorted(r["rank"] for r in rows)
    values = [r["implied_value_usd"] for r in sorted(rows, key=lambda r: r["rank"])]
    if ranks != list(range(1, len(rows) + 1)):
        bad("sorted_by_value", "the ranks are not 1..N once each")
    elif any(values[i] > values[i - 1] for i in range(1, len(values))):
        first = next(i for i in range(1, len(values)) if values[i] > values[i - 1])
        bad("sorted_by_value", f"implied value rises at rank {first + 1}")
    elif len(set(values)) == 1 and len(rows) > 1:
        bad("sorted_by_value", "every implied value is the same")
    else:
        ok("sorted_by_value", f"ranks 1..{len(rows)}, values {values[0]:,} down to {values[-1]:,}")

    covered = {r["slug"] for r in rows}
    missing = [s for s in SNAP["watchlist"] if s not in covered]
    if missing:
        bad("coverage", f"{len(missing)} watchlist slugs missing: {missing[:3]}")
    else:
        outside = len(covered - set(SNAP["watchlist"]))
        ok("coverage", f"all {len(SNAP['watchlist'])} watchlist slugs, {outside} more below the floor")

# ---------------------------------------------------------------- 6. screenshots
shots = sorted(p for p in (OUT / "screenshots").glob("*") if p.is_file() and not p.name.startswith("."))
if not (3 <= len(shots) <= 4):
    bad("screenshots", f"{len(shots)} images, the gate wants 3 or 4")
else:
    problems = []
    for p in shots:
        if not PLAIN.match(p.name):
            problems.append(f"{p.name}: name")
            continue
        size = p.stat().st_size
        if size > 512 * 1024:
            problems.append(f"{p.name}: {size} bytes over 512 KiB")
        try:
            with PIL.Image.open(p) as im:
                im.verify()
            with PIL.Image.open(p) as im:
                w, h = im.size
        except Exception as err:  # noqa: BLE001 - any decode failure is a gate failure
            problems.append(f"{p.name}: not a whole image ({err})")
            continue
        long_side, short_side = max(w, h), min(w, h)
        if long_side > 1440:
            problems.append(f"{p.name}: long side {long_side} over 1440")
        if short_side < 800:
            problems.append(f"{p.name}: short side {short_side} under 800")
    if problems:
        bad("screenshots", "; ".join(problems))
    else:
        ok("screenshots", f"{len(shots)} images, {sum(p.stat().st_size for p in shots) / 1024:.0f} KB")

# ---------------------------------------------------------------- 7. dossier_matches
dossier = OUT / "dossier.json"
if not dossier.exists():
    bad("dossier_matches", "no dossier.json")
else:
    rebuild = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "-e",
            "import { buildDossier } from './vendor/makefun-board.ts';"
            "process.stdout.write(Buffer.from(buildDossier(process.argv[1],"
            "{text_max_bytes: 65536, screenshots: {max: 4, max_bytes: 524288},"
            "dashboard: {max_files: 400, max_bytes: 4194304}})).toString('base64'));",
            str(OUT),
        ],
        cwd=str(HERE),
        capture_output=True,
        text=True,
    )
    if rebuild.returncode != 0:
        bad("dossier_matches", f"buildDossier refused: {rebuild.stderr.strip()[:200]}")
    else:
        import base64

        expected = base64.b64decode(rebuild.stdout)
        actual = dossier.read_bytes()
        if expected != actual:
            bad("dossier_matches", f"{len(actual)} bytes on disk, {len(expected)} rebuilt")
        elif len(actual) > 1_536_000:
            bad("dossier_matches", f"{len(actual)} bytes over 1.5 MiB")
        else:
            ok("dossier_matches", f"{len(actual) / 1024:.0f} KB, byte-identical to a rebuild")

print("\n".join(passes))
print()
print("\n".join(failures) if failures else "all seven rows pass")
sys.exit(1 if failures else 0)
