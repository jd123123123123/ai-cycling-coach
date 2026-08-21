"""Mirror the W3 shop catalogue out of the TypeScript source into Python.

    backend/.venv/bin/python backend/scripts/sync_catalog.py           # rewrite
    backend/.venv/bin/python backend/scripts/sync_catalog.py --check   # CI/drift

WHY THIS EXISTS. The bike ladder (`w3bikes.ts`) and the parts wall
(`w3parts.ts`) are authored in the frontend, but a price that only exists in the
frontend is not a price — a rider could POST the 15 000 RC prototype at a price
of their choosing. The shop therefore charges from a SERVER copy
(`app/services/w3catalog.py`), and this script is the one sanctioned way that
copy is produced. `tests/test_shop.py::TestCatalogDrift` re-parses the same TS
and fails if the mirror is stale, so editing the catalogue without re-running
this script is loud rather than silent.

The parser is deliberately the same shape as `generate_bikes.py`'s — regex over
the TS source rather than a JS runtime, so the build has no Node dependency.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIKES_TS = ROOT / "frontend/src/editorial/w3/w3bikes.ts"
PARTS_TS = ROOT / "frontend/src/editorial/w3/w3parts.ts"
MIRROR = ROOT / "backend/app/services/w3catalog.py"
TOKENS_TSX = ROOT / "frontend/src/editorial/w3/w3tokens.tsx"

# A single-quoted TS string literal, tolerating \' escapes (German names such as
# "Der Kopfsteinpflaster-König" are plain, but the ladder is authored prose and
# an apostrophe is one edit away).
_STR = r"(?:[^'\\]|\\.)*"

_BIKE_RE = re.compile(
    rf"\{{\s*id:\s*'({_STR})',\s*name:\s*'({_STR})',\s*tier:\s*'({_STR})',\s*price:\s*(\d+)"
)
_PART_RE = re.compile(
    rf"\{{\s*id:\s*'({_STR})',\s*name:\s*'({_STR})',\s*slot:\s*'({_STR})',\s*price:\s*(\d+)"
)
# The literal description each item's art was generated from. Lazy from the id
# to the FIRST prompt, which is safe because every catalogue object carries
# exactly one and they are written in sequence. The server needs these because
# the composed bike render (`services/bike_render`) asks the image model for
# "this bike, with these components" — and the prompt IS the component.
# A prompt is authored either as a plain string or — once a colour has to agree
# with the design tokens — as a template literal splicing `${T.<token>}` in. Both
# spellings are read; the interpolation is resolved against `w3tokens.tsx` so the
# mirror stores the literal colour the image model is actually asked for.
_TEMPLATE_STR = r"(?:[^`\\]|\\.)*"
_PROMPT_RE = re.compile(
    rf"\{{\s*id:\s*'({_STR})'.*?prompt:\s*(?:'({_STR})'|`({_TEMPLATE_STR})`)", re.S
)
_TOKEN_PAIR_RE = re.compile(rf"(\w+):\s*'({_STR})'")
_INTERP_RE = re.compile(r"\$\{\s*T\.(\w+)\s*\}")
_STARTER_RE = re.compile(rf"STARTER_BIKE_ID\s*=\s*'({_STR})'")
_STOCK_BLOCK_RE = re.compile(r"STOCK_PARTS:\s*Record<PartSlot,\s*string>\s*=\s*\{(.*?)\}", re.S)
_STOCK_PAIR_RE = re.compile(rf"(\w+):\s*'({_STR})'")
_SLOTS_RE = re.compile(rf"\{{\s*slot:\s*'({_STR})',\s*label:")


def _unescape(raw: str) -> str:
    return raw.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")


def _load_tokens() -> dict[str, str]:
    """The `T` colour table, so `${T.acid}` in a prompt becomes the hex itself."""
    return {k: _unescape(v) for k, v in _TOKEN_PAIR_RE.findall(TOKENS_TSX.read_text(encoding="utf-8"))}


def _resolve(prompt: str, tokens: dict[str, str]) -> str:
    def sub(m: re.Match[str]) -> str:
        token = m.group(1)
        if token not in tokens:
            raise SystemExit(f"prompt references an unknown token: T.{token}")
        return tokens[token]

    return _INTERP_RE.sub(sub, prompt)


def build_catalog() -> dict:
    """Parse both TS files into the plain-data shape the mirror encodes.

    Returned as builtins only (no dataclasses), so the drift test can compare it
    against the generated module without either side importing the other."""
    bikes_src = BIKES_TS.read_text(encoding="utf-8")
    parts_src = PARTS_TS.read_text(encoding="utf-8")

    tokens = _load_tokens()
    prompts: dict[str, str] = {
        _unescape(i): _resolve(_unescape(quoted or templated), tokens)
        for i, quoted, templated in _PROMPT_RE.findall(bikes_src)
        + _PROMPT_RE.findall(parts_src)
    }

    items: dict[str, dict] = {}
    for item_id, name, tier, price in _BIKE_RE.findall(bikes_src):
        items[_unescape(item_id)] = {
            "id": _unescape(item_id),
            "name": _unescape(name),
            "kind": "bike",
            "tier": _unescape(tier),
            "slot": None,
            "price": int(price),
            "prompt": prompts.get(_unescape(item_id), ""),
        }
    n_bikes = len(items)
    for item_id, name, slot, price in _PART_RE.findall(parts_src):
        items[_unescape(item_id)] = {
            "id": _unescape(item_id),
            "name": _unescape(name),
            "kind": "part",
            "tier": None,
            "slot": _unescape(slot),
            "price": int(price),
            "prompt": prompts.get(_unescape(item_id), ""),
        }

    missing = [i for i, it in items.items() if not it["prompt"]]
    if missing:
        raise SystemExit(f"catalogue items with no prompt (art cannot be composed): {missing}")

    if not n_bikes or len(items) == n_bikes:
        raise SystemExit(
            f"catalogue parse looks wrong: {n_bikes} bikes, {len(items) - n_bikes} parts — "
            "did the TS shape change?"
        )

    starter = _STARTER_RE.search(bikes_src)
    if not starter:
        raise SystemExit("STARTER_BIKE_ID not found in w3bikes.ts")

    stock_block = _STOCK_BLOCK_RE.search(parts_src)
    if not stock_block:
        raise SystemExit("STOCK_PARTS not found in w3parts.ts")
    stock = {k: _unescape(v) for k, v in _STOCK_PAIR_RE.findall(stock_block.group(1))}

    slots = tuple(_unescape(s) for s in _SLOTS_RE.findall(parts_src))
    if not slots:
        raise SystemExit("SLOTS not found in w3parts.ts")

    return {
        "items": items,
        "starter_bike_id": _unescape(starter.group(1)),
        "stock_parts": stock,
        "part_slots": slots,
    }


def _q(value: str | None) -> str:
    if value is None:
        return "None"
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


HEADER = '''"""W3 shop catalogue — the SERVER's copy of the bike ladder and the parts wall.

GENERATED FILE — DO NOT EDIT BY HAND.

    Regenerate:  backend/.venv/bin/python backend/scripts/sync_catalog.py
    Sources:     frontend/src/editorial/w3/w3bikes.ts
                 frontend/src/editorial/w3/w3parts.ts

WHY A MIRROR AND NOT A CLIENT PAYLOAD. Price is the only thing standing between
a rider and the 15 000 RC prototype, so it can never arrive in a request body.
`services/shop.purchase` looks every price up HERE and ignores whatever the
client thinks an item costs. `tests/test_shop.py::TestCatalogDrift` re-parses the
TypeScript and fails if this file is stale — editing the catalogue without
re-running the sync script breaks the build rather than mispricing the shop.

Only what the server actually needs is mirrored (id, name, kind, tier/slot,
price, prompt). Blurbs and art paths stay in the frontend, where they belong.
The PROMPT is here because the composed bike render asks the image model for
"this bike, wearing these components", and the prompt is how a component is
described — see `services/bike_render`.
"""
from __future__ import annotations

from dataclasses import dataclass

KIND_BIKE = "bike"
KIND_PART = "part"


@dataclass(frozen=True)
class CatalogItem:
    """One purchasable thing. ``tier`` is set for bikes, ``slot`` for parts —
    never both, and the slot is what tells `shop.equip` which column to write."""

    id: str
    name: str
    kind: str
    tier: str | None
    slot: str | None
    price: int
    prompt: str = ""


'''

FOOTER = '''

# The things every rider owns from the first minute: the starter bike and the
# stock part in each slot. `shop.ensure_starter` grants exactly this set — it is
# derived from price, so a future free item joins it without a code change.
FREE_ITEM_IDS: tuple[str, ...] = tuple(
    item_id for item_id, item in CATALOG.items() if item.price == 0
)


def get(item_id: str) -> CatalogItem | None:
    """The catalogue entry for an id, or ``None`` when nothing is sold under it."""
    return CATALOG.get(item_id)
'''


def render(catalog: dict) -> str:
    out = [HEADER]
    out.append(
        "PART_SLOTS: tuple[str, ...] = (\n"
        + "".join(f"    {_q(s)},\n" for s in catalog["part_slots"])
        + ")\n\n"
    )
    out.append(f"STARTER_BIKE_ID = {_q(catalog['starter_bike_id'])}\n\n")
    out.append(
        "STOCK_PARTS: dict[str, str] = {\n"
        + "".join(f"    {_q(k)}: {_q(v)},\n" for k, v in catalog["stock_parts"].items())
        + "}\n\n"
    )
    out.append("CATALOG: dict[str, CatalogItem] = {\n")
    for item in catalog["items"].values():
        out.append(
            f"    {_q(item['id'])}: CatalogItem(\n"
            f"        id={_q(item['id'])}, name={_q(item['name'])}, kind={_q(item['kind'])},\n"
            f"        tier={_q(item['tier'])}, slot={_q(item['slot'])}, price={item['price']},\n"
            f"        prompt={_q(item['prompt'])},\n"
            f"    ),\n"
        )
    out.append("}\n")
    out.append(FOOTER)
    return "".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--check", action="store_true",
        help="exit non-zero if the mirror is stale instead of rewriting it",
    )
    args = ap.parse_args()

    catalog = build_catalog()
    rendered = render(catalog)
    current = MIRROR.read_text(encoding="utf-8") if MIRROR.exists() else None

    if current == rendered:
        print(f"up to date: {len(catalog['items'])} items -> {MIRROR.relative_to(ROOT)}")
        return 0
    if args.check:
        print(f"STALE: {MIRROR.relative_to(ROOT)} does not match the TS catalogue", file=sys.stderr)
        return 1

    MIRROR.write_text(rendered, encoding="utf-8")
    bikes = sum(1 for i in catalog["items"].values() if i["kind"] == "bike")
    parts = len(catalog["items"]) - bikes
    print(f"wrote {bikes} bikes + {parts} parts -> {MIRROR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
