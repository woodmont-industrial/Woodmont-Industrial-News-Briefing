#!/usr/bin/env python3
"""Build the public browser watchlist from the private ownership workbook.

Only the fields used by matching and competitor-source discovery are published
to docs/. Remaining workbook columns are not copied into the
browser-readable JSON.
"""

from __future__ import annotations

import argparse
import os
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
# The workbook is NOT committed. It carries more columns than the matcher
# needs, so it is kept outside the tree and only the projection below is
# published. Override the location with CM_WATCHLIST_WORKBOOK.
DEFAULT_INPUT = Path(
    os.environ.get("CM_WATCHLIST_WORKBOOK")
    or Path.home() / "Downloads" / "woodmont-private" / "institutional-ownership-nnj.xlsx"
)
DEFAULT_OUTPUT = ROOT / "docs" / "data" / "capital-markets-watchlist.json"
XML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def cell_column(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference or "")
    if not letters:
        raise ValueError(f"Invalid worksheet cell reference: {reference!r}")
    value = 0
    for char in letters.group(0):
        value = value * 26 + ord(char) - ord("A") + 1
    return value - 1


def rich_text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return "".join(part.text or "" for part in node.iter(f"{XML_NS}t"))


def workbook_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        try:
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [rich_text(item) for item in shared_root.findall(f"{XML_NS}si")]
        except KeyError:
            pass

        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row_node in sheet.findall(f".//{XML_NS}sheetData/{XML_NS}row"):
            cells: dict[int, str] = {}
            for cell in row_node.findall(f"{XML_NS}c"):
                column = cell_column(cell.attrib.get("r", ""))
                value_node = cell.find(f"{XML_NS}v")
                cell_type = cell.attrib.get("t", "")
                raw = value_node.text if value_node is not None and value_node.text is not None else ""
                if cell_type == "s" and raw:
                    value = shared[int(raw)]
                elif cell_type == "inlineStr":
                    value = rich_text(cell.find(f"{XML_NS}is"))
                elif cell_type == "b":
                    value = "true" if raw == "1" else "false"
                else:
                    value = raw
                cells[column] = value.strip()
            width = max(cells, default=-1) + 1
            rows.append([cells.get(column, "") for column in range(width)])
    return rows


def normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ").strip()).lower()


def domain_of(value: str) -> str:
    raw = value.strip()
    if not raw:
        return ""
    candidate = raw if re.match(r"^https?://", raw, re.I) else f"https://{raw}"
    try:
        hostname = (urlsplit(candidate).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""
    return hostname.removeprefix("www.")


def build_payload(input_path: Path) -> dict[str, object]:
    rows = workbook_rows(input_path)
    if not rows:
        raise ValueError("Ownership workbook has no rows")
    header = {normalize_header(value): index for index, value in enumerate(rows[0])}
    aliases = {
        "Company Name": "company name",
        "Secondary Type": "secondary type",
        "City": "city",
        "State / Country": "state / country",
        "Website": "website",
    }
    # PUBLISHED projection: the only fields matching and competitor-source
    # discovery read. Everything else in the workbook is deliberately not
    # emitted. Enforced by tests/capital-markets/public-watchlist.test.mjs.
    published = ("Company Name", "Secondary Type", "City", "State / Country",
                 "Website", "Website Domain")
    missing = [source for source in aliases.values() if source not in header]
    if missing:
        raise ValueError(f"Ownership workbook is missing required columns: {', '.join(missing)}")

    def value(row: list[str], source: str) -> str:
        index = header[source]
        return row[index].strip() if index < len(row) else ""

    companies: list[dict[str, str]] = []
    for source_row in rows[1:]:
        if not any(item.strip() for item in source_row):
            continue
        company = {
            output: value(source_row, source)
            for output, source in aliases.items()
        }
        company["Website Domain"] = domain_of(company["Website"])
        if not company["Company Name"]:
            raise ValueError("Ownership workbook contains a data row without Company Name")
        companies.append({key: company.get(key, "") for key in published})

    return {
        "version": 1,
        "visibility": "public-repository",
        "sourceWorkbook": "private (not committed)",
        "rowCount": len(companies),
        "companies": companies,
    }


def encoded(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="Fail if the committed JSON is stale")
    args = parser.parse_args()

    content = encoded(build_payload(args.input.resolve()))
    output = args.output.resolve()
    if args.check:
        current = output.read_text(encoding="utf-8") if output.exists() else ""
        if current != content:
            print("Capital Markets public watchlist JSON is stale; run npm run build:cm-watchlist", file=sys.stderr)
            return 1
        print(f"Capital Markets public watchlist is current ({json.loads(content)['rowCount']} companies)")
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8")
    print(f"Wrote {output.relative_to(ROOT)} ({json.loads(content)['rowCount']} companies)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
