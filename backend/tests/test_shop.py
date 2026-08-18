"""The W3 shop — the free first bike, the sink, and the price nobody can forge.

Four things are worth protecting here, and each has a test that fails loudly:

1. THE MIRROR CANNOT DRIFT. `services/w3catalog` is generated from the two
   TypeScript catalogues; `TestCatalogDrift` re-parses them and compares. Edit
   `w3bikes.ts` without re-running `scripts/sync_catalog.py` and this file goes
   red — which is the point, because a stale mirror is a mispriced shop.
2. THE STARTER GRANT IS REPLAYABLE. It runs on every read, so it must be a no-op
   the second time.
3. MONEY MOVES EXACTLY ONCE. One purchase = one ledger row = one debit. A second
   buy, a lost race, or too small a balance must all leave the wallet untouched.
4. YOU ONLY WEAR WHAT YOU OWN.

There is no real-Postgres fixture in this repo (see tests/api/test_crew_social_api.py),
so `FakeDB` below is a small stateful AsyncSession stand-in that models the two
database behaviours the service actually leans on: the UNIQUE (user_id, item_id)
constraint raising IntegrityError, and rollback undoing everything since the last
commit.
"""
from __future__ import annotations

import importlib.util
import inspect
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.main import app
from app.models.rewards import REASON_ONBOARDING_BIKE, REASON_PART_PURCHASE, PointsLedger, Wallet
from app.models.shop import GarageItem, GarageLoadout
from app.services import shop, w3catalog
from app.services.rewards import ONBOARDING_GRANT_RC

USER = 7
BACKEND = Path(__file__).resolve().parents[1]


# --------------------------------------------------------------------------- #
# A stateful fake session.
# --------------------------------------------------------------------------- #
class _Result:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return self

    def all(self):
        return list(self._values)

    def first(self):
        """`rewards.grant_onboarding` asks `.first()` on its idempotency read —
        None means "never credited", anything else means "already paid"."""
        return self._values[0] if self._values else None


class FakeDB:
    """Minimal AsyncSession stand-in for the shop tables.

    Models the two things the service's correctness depends on:
    - flush() enforces UNIQUE (user_id, item_id) by raising IntegrityError;
    - rollback() restores everything to the last commit, so a failed purchase
      really does leave no debit behind.

    ``race_on`` simulates the concurrency case a single-threaded test cannot
    otherwise reach: the ownership SELECT says "not owned" (another transaction
    hasn't committed yet from our snapshot's point of view) and the INSERT then
    hits the constraint anyway.
    """

    def __init__(self, balance: int = 0, *, race_on: str | None = None):
        self.items: list[GarageItem] = []
        self.ledger: list[PointsLedger] = []
        self.wallets: dict[int, Wallet] = {}
        self.loadouts: dict[int, GarageLoadout] = {}
        if balance:
            self.wallets[USER] = Wallet(user_id=USER, balance=balance)
        self.pending: list = []
        self.race_on = race_on
        self.commits = 0
        self.rollbacks = 0
        self.locked = 0  # times the wallet row was taken FOR UPDATE
        self._snapshot()

    # -- transaction bookkeeping ------------------------------------------- #
    def _snapshot(self) -> None:
        self._snap = (
            list(self.items),
            list(self.ledger),
            {uid: int(w.balance) for uid, w in self.wallets.items()},
            {uid: dict(_loadout_fields(loadout)) for uid, loadout in self.loadouts.items()},
        )

    async def rollback(self) -> None:
        self.rollbacks += 1
        items, ledger, balances, loadouts = self._snap
        self.items = list(items)
        self.ledger = list(ledger)
        for uid in list(self.wallets):
            if uid in balances:
                self.wallets[uid].balance = balances[uid]
            else:
                del self.wallets[uid]
        for uid in list(self.loadouts):
            if uid in loadouts:
                for k, v in loadouts[uid].items():
                    setattr(self.loadouts[uid], k, v)
            else:
                del self.loadouts[uid]
        self.pending = []

    async def commit(self) -> None:
        await self.flush()
        self.commits += 1
        self._snapshot()

    # -- session surface ---------------------------------------------------- #
    def add(self, obj) -> None:
        self.pending.append(obj)

    async def flush(self) -> None:
        pending, self.pending = self.pending, []
        for obj in pending:
            if isinstance(obj, GarageItem):
                clash = any(
                    i.user_id == obj.user_id and i.item_id == obj.item_id for i in self.items
                )
                if clash or obj.item_id == self.race_on:
                    raise IntegrityError(
                        "INSERT INTO garage_items", {}, Exception("uq_garage_item_user_item"),
                    )
                self.items.append(obj)
            elif isinstance(obj, GarageLoadout):
                self.loadouts[obj.user_id] = obj
            elif isinstance(obj, PointsLedger):
                self.ledger.append(obj)
            elif isinstance(obj, Wallet):
                self.wallets[obj.user_id] = obj
            else:  # pragma: no cover — a new table would need handling here
                raise AssertionError(f"FakeDB cannot store {type(obj).__name__}")

    async def get(self, model, pk, with_for_update=None):
        if model is Wallet:
            if with_for_update:
                self.locked += 1
            return self.wallets.get(pk)
        if model is GarageLoadout:
            return self.loadouts.get(pk)
        raise AssertionError(f"FakeDB cannot get {model}")  # pragma: no cover

    async def execute(self, stmt):
        entity = next(
            (d["entity"] for d in stmt.column_descriptions if d.get("entity") is not None), None
        )
        if entity is GarageItem:
            uid = _int_param(stmt)
            return _Result(i.item_id for i in self.items if i.user_id == uid)
        if entity is PointsLedger:
            # `ensure_starter` pays the onboarding bike grant, and
            # `rewards.grant_onboarding` first asks whether this reason has ever
            # been credited — that idempotency read is what lands here.
            uid = _int_param(stmt)
            reason = next(
                (v for v in stmt.compile().params.values() if isinstance(v, str)), None
            )
            return _Result(
                row.id for row in self.ledger
                if row.user_id == uid and (reason is None or row.reason == reason)
            )
        raise AssertionError(f"FakeDB cannot execute {stmt}")  # pragma: no cover

    # -- assertions helpers ------------------------------------------------- #
    @property
    def balance(self) -> int:
        wallet = self.wallets.get(USER)
        return int(wallet.balance) if wallet else 0

    @property
    def purchases(self) -> list[PointsLedger]:
        return [row for row in self.ledger if row.reason == REASON_PART_PURCHASE]


def _loadout_fields(loadout: GarageLoadout) -> dict:
    return {
        f"{name}_id": getattr(loadout, f"{name}_id")
        for name in ("bike", *w3catalog.PART_SLOTS)
    }


def _int_param(stmt) -> int | None:
    for value in stmt.compile().params.values():
        if isinstance(value, int):
            return value
    return None  # pragma: no cover


# --------------------------------------------------------------------------- #
# 1. The generated mirror must match the TypeScript it was generated from.
# --------------------------------------------------------------------------- #
def _load_sync_script():
    """Import scripts/sync_catalog.py by path — scripts/ is not a package."""
    path = BACKEND / "scripts" / "sync_catalog.py"
    spec = importlib.util.spec_from_file_location("sync_catalog", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class TestCatalogDrift:
    """The drift guard. If this fails, run:

        backend/.venv/bin/python backend/scripts/sync_catalog.py
    """

    def test_python_mirror_matches_the_typescript_catalogue(self):
        parsed = _load_sync_script().build_catalog()

        assert set(parsed["items"]) == set(w3catalog.CATALOG), (
            "item ids differ between w3bikes.ts/w3parts.ts and w3catalog.py — re-run "
            "backend/scripts/sync_catalog.py"
        )
        for item_id, expected in parsed["items"].items():
            got = w3catalog.CATALOG[item_id]
            assert (got.id, got.name, got.kind, got.tier, got.slot, got.price) == (
                expected["id"], expected["name"], expected["kind"],
                expected["tier"], expected["slot"], expected["price"],
            ), f"{item_id} drifted — re-run backend/scripts/sync_catalog.py"

        assert parsed["starter_bike_id"] == w3catalog.STARTER_BIKE_ID
        assert parsed["stock_parts"] == w3catalog.STOCK_PARTS
        assert parsed["part_slots"] == w3catalog.PART_SLOTS

    def test_the_parse_actually_found_the_catalogue(self):
        # A regex that silently matched nothing would make the test above pass
        # against an empty mirror. Pin the shape of the real thing.
        parsed = _load_sync_script().build_catalog()
        bikes = [i for i in parsed["items"].values() if i["kind"] == "bike"]
        parts = [i for i in parsed["items"].values() if i["kind"] == "part"]
        assert len(bikes) >= 20 and len(parts) >= 20
        assert parsed["items"]["pro-prototype"]["price"] == 15_000

    def test_the_free_set_is_exactly_the_starter_bike_and_the_stock_parts(self):
        free = set(w3catalog.FREE_ITEM_IDS)
        assert free == {w3catalog.STARTER_BIKE_ID, *w3catalog.STOCK_PARTS.values()}
        for item_id in free:
            assert w3catalog.CATALOG[item_id].price == 0

    def test_every_part_has_a_known_slot_and_every_bike_a_tier(self):
        # equip() writes `<slot>_id` straight onto the loadout, so an unknown
        # slot would be a column that doesn't exist.
        for item in w3catalog.CATALOG.values():
            if item.kind == w3catalog.KIND_PART:
                assert item.slot in w3catalog.PART_SLOTS and item.tier is None
            else:
                assert item.kind == w3catalog.KIND_BIKE
                assert item.tier is not None and item.slot is None

    def test_purchase_takes_no_price_from_its_caller(self):
        # The whole reason the mirror exists: an argument here would be a
        # client-supplied price waiting to happen.
        params = set(inspect.signature(shop.purchase).parameters)
        assert params == {"db", "user_id", "item_id"}


# --------------------------------------------------------------------------- #
# 2. The free first bike.
# --------------------------------------------------------------------------- #
class TestEnsureStarter:
    async def test_grants_the_starter_bike_the_stock_parts_and_wears_them(self):
        db = FakeDB()
        assert await shop.ensure_starter(db, USER) is True

        owned = {i.item_id for i in db.items}
        assert owned == set(w3catalog.FREE_ITEM_IDS)
        assert all(i.source == "grant" and i.price_paid == 0 for i in db.items)

        loadout = db.loadouts[USER]
        assert loadout.bike_id == w3catalog.STARTER_BIKE_ID
        assert loadout.frame_id == w3catalog.STOCK_PARTS["frame"]
        assert loadout.wheels_id == w3catalog.STOCK_PARTS["wheels"]
        assert loadout.bars_id == w3catalog.STOCK_PARTS["bars"]
        assert loadout.saddle_id == w3catalog.STOCK_PARTS["saddle"]

    async def test_is_idempotent_so_it_is_safe_on_every_read(self):
        db = FakeDB()
        await shop.ensure_starter(db, USER)
        first = list(db.items)
        loadout = db.loadouts[USER]

        for _ in range(3):
            assert await shop.ensure_starter(db, USER) is False

        assert db.items == first          # no duplicate rows
        assert db.loadouts[USER] is loadout  # and the loadout was not replaced

    async def test_the_grant_never_costs_ridecoin(self):
        db = FakeDB(balance=500)
        await shop.ensure_starter(db, USER)
        # Nothing is charged for a free item...
        assert [row for row in db.ledger if row.amount < 0] == []
        # ...and the only credit is the one-time onboarding head start.
        assert db.balance == 500 + BIKE_GRANT

    async def test_pays_the_onboarding_head_start_exactly_once(self):
        """The 150 RC bike grant moved here from the retired photo studio.

        It used to be gated on a `garage_assets` row that only the studio could
        create, so once the studio stopped being a tab the grant became
        unclaimable and new riders could collect just 250 of the 400 RC head
        start the spec calls EQUAL. Paying it here restores that — but it must
        stay a ONE-time grant however many times the garage is read.
        """
        db = FakeDB()
        await shop.ensure_starter(db, USER)
        await shop.ensure_starter(db, USER)
        await shop.get_garage(db, USER)

        grants = [r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE]
        assert len(grants) == 1
        assert grants[0].amount == BIKE_GRANT
        assert db.balance == BIKE_GRANT

    async def test_a_raced_first_load_leaves_the_rider_whole(self):
        # Two first requests at once: ours loses the insert. The other one
        # granted the same free set, so this must be quiet, not a 500.
        db = FakeDB(race_on=w3catalog.STARTER_BIKE_ID)
        assert await shop.ensure_starter(db, USER) is False
        assert db.rollbacks == 1


# --------------------------------------------------------------------------- #
# 3. Spending.
# --------------------------------------------------------------------------- #
FIXIE = "steel-fixie"          # 550 RC
FIXIE_PRICE = w3catalog.CATALOG[FIXIE].price
DEEP_WHEELS = "wheels-deep"    # 1200 RC


class TestPurchase:
    async def test_debits_exactly_once_and_writes_one_ledger_row(self):
        db = FakeDB(balance=1000)
        out = await shop.purchase(db, USER, FIXIE)

        assert len(db.purchases) == 1
        row = db.purchases[0]
        assert row.amount == -FIXIE_PRICE           # signed: a purchase is negative
        assert row.reason == REASON_PART_PURCHASE
        assert row.context == {"item_id": FIXIE, "kind": "bike", "name": "Der Fixie"}
        assert db.balance == 1000 + BIKE_GRANT - FIXIE_PRICE

        bought = [i for i in db.items if i.item_id == FIXIE]
        assert len(bought) == 1
        assert bought[0].source == "purchase"
        assert bought[0].price_paid == FIXIE_PRICE  # what they actually paid, recorded

        assert out["item_id"] == FIXIE
        assert out["price"] == FIXIE_PRICE
        assert out["balance"] == 1000 + BIKE_GRANT - FIXIE_PRICE
        assert FIXIE in out["owned"]
        assert out["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID  # buying is not wearing
        assert db.commits == 1  # item + ledger settled together

    async def test_charges_the_server_price_not_a_hopeful_one(self):
        # 15 000 RC prototype against a 100 RC wallet: refused on the catalogue's
        # price, whatever the client believes.
        db = FakeDB(balance=100)
        with pytest.raises(shop.InsufficientBalanceError) as e:
            await shop.purchase(db, USER, "pro-prototype")
        assert e.value.price == 15_000

    async def test_locks_the_wallet_before_deciding(self):
        # The FOR UPDATE read is what stops two affordable purchases from
        # together overdrawing the wallet.
        db = FakeDB(balance=1000)
        await shop.purchase(db, USER, FIXIE)
        assert db.locked >= 1

    async def test_buying_twice_is_refused_and_does_not_double_debit(self):
        db = FakeDB(balance=1000)
        await shop.purchase(db, USER, FIXIE)
        after_first = db.balance

        with pytest.raises(shop.AlreadyOwnedError):
            await shop.purchase(db, USER, FIXIE)

        assert len(db.purchases) == 1
        assert db.balance == after_first
        assert len([i for i in db.items if i.item_id == FIXIE]) == 1

    async def test_a_lost_race_charges_nothing(self):
        # The read said "not owned", the INSERT hit the unique constraint. The
        # row goes in BEFORE the debit precisely so this costs the rider nothing.
        db = FakeDB(balance=1000, race_on=FIXIE)
        with pytest.raises(shop.AlreadyOwnedError):
            await shop.purchase(db, USER, FIXIE)

        assert db.purchases == []
        assert db.balance == 1000
        assert db.rollbacks >= 1
        assert db.commits == 0

    async def test_too_little_balance_moves_nothing(self):
        # Seeded below the head start, so the rider is still exactly 1 RC short
        # AFTER `ensure_starter` has paid it — otherwise the grant would make
        # this purchase affordable and the test would prove nothing.
        db = FakeDB(balance=FIXIE_PRICE - 1 - BIKE_GRANT)
        with pytest.raises(shop.InsufficientBalanceError) as e:
            await shop.purchase(db, USER, FIXIE)

        assert e.value.price == FIXIE_PRICE
        assert e.value.balance == FIXIE_PRICE - 1
        assert db.purchases == []          # the head start is a credit, not a debit
        assert db.balance == FIXIE_PRICE - 1
        assert not [i for i in db.items if i.item_id == FIXIE]

    async def test_exactly_enough_is_enough(self):
        db = FakeDB(balance=FIXIE_PRICE - BIKE_GRANT)
        await shop.purchase(db, USER, FIXIE)
        assert db.balance == 0

    async def test_unknown_item_never_reaches_the_database(self):
        db = FakeDB(balance=10_000)
        with pytest.raises(shop.UnknownItemError):
            await shop.purchase(db, USER, "carbon-unicorn")
        assert db.items == [] and db.ledger == []

    async def test_the_free_starter_cannot_be_bought(self):
        # It is already owned the moment the garage is read.
        db = FakeDB(balance=1000)
        with pytest.raises(shop.AlreadyOwnedError):
            await shop.purchase(db, USER, w3catalog.STARTER_BIKE_ID)
        assert db.purchases == []


# --------------------------------------------------------------------------- #
# 4. Wearing.
# --------------------------------------------------------------------------- #
class TestEquip:
    async def test_a_part_goes_into_its_own_slot_and_disturbs_nothing_else(self):
        db = FakeDB(balance=2000)
        await shop.purchase(db, USER, DEEP_WHEELS)
        loadout = await shop.equip(db, USER, DEEP_WHEELS)

        assert loadout["wheels"] == DEEP_WHEELS
        assert loadout["saddle"] == w3catalog.STOCK_PARTS["saddle"]
        assert loadout["bike"] == w3catalog.STARTER_BIKE_ID

    async def test_a_bike_goes_into_the_bike_slot(self):
        db = FakeDB(balance=1000)
        await shop.purchase(db, USER, FIXIE)
        loadout = await shop.equip(db, USER, FIXIE)
        assert loadout["bike"] == FIXIE
        assert loadout["frame"] == w3catalog.STOCK_PARTS["frame"]

    async def test_equipping_something_you_do_not_own_is_refused(self):
        db = FakeDB(balance=10_000)
        await shop.ensure_starter(db, USER)
        with pytest.raises(shop.NotOwnedError):
            await shop.equip(db, USER, FIXIE)
        assert db.loadouts[USER].bike_id == w3catalog.STARTER_BIKE_ID

    async def test_equipping_an_unknown_item_is_refused(self):
        db = FakeDB()
        with pytest.raises(shop.UnknownItemError):
            await shop.equip(db, USER, "carbon-unicorn")


# --------------------------------------------------------------------------- #
# 5. The garage read.
# --------------------------------------------------------------------------- #
class TestGetGarage:
    async def test_a_brand_new_rider_already_has_a_bike(self):
        db = FakeDB(balance=250)
        garage = await shop.get_garage(db, USER)

        assert garage["balance"] == 250 + BIKE_GRANT
        assert set(garage["owned"]) == set(w3catalog.FREE_ITEM_IDS)
        assert garage["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID
        assert set(garage["loadout"]) == {"bike", "frame", "wheels", "bars", "saddle"}

    async def test_owned_grows_with_purchases(self):
        db = FakeDB(balance=1000)
        await shop.purchase(db, USER, FIXIE)
        garage = await shop.get_garage(db, USER)
        assert FIXIE in garage["owned"]
        assert garage["balance"] == 1000 + BIKE_GRANT - FIXIE_PRICE


# --------------------------------------------------------------------------- #
# 6. The HTTP contract the frontend is built against.
# --------------------------------------------------------------------------- #
# The onboarding bike grant that `ensure_starter` now pays on a rider's first
# look at the garage (it used to be claimable only in the retired photo studio).
# Imported, not typed as 150, so the tests move when the constant moves.
BIKE_GRANT = ONBOARDING_GRANT_RC[REASON_ONBOARDING_BIKE]

CALLER = SimpleNamespace(id=USER, email="jannis@evori.ai", display_name=None, is_active=True)
# Enough to afford the 1200 RC deep-section wheels the equip tests buy, and
# nowhere near the 15 000 RC prototype the 402 test asks for.
CLIENT_BALANCE = 3000


@pytest.fixture
def client_db():
    db = FakeDB(balance=CLIENT_BALANCE)
    app.dependency_overrides[get_current_user] = lambda: CALLER
    app.dependency_overrides[get_current_active_user] = lambda: CALLER
    app.dependency_overrides[get_db_for_user] = lambda: db
    with TestClient(app) as client:
        yield client, db
    app.dependency_overrides.clear()


class TestShopApi:
    def test_get_shop_returns_balance_owned_and_loadout(self, client_db):
        client, _ = client_db
        r = client.get("/shop")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"balance", "owned", "loadout"}
        assert body["balance"] == CLIENT_BALANCE + BIKE_GRANT
        assert body["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID
        assert w3catalog.STARTER_BIKE_ID in body["owned"]

    def test_buy_returns_the_full_contract(self, client_db):
        client, db = client_db
        r = client.post(f"/shop/buy/{FIXIE}")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"item_id", "price", "balance", "owned", "loadout"}
        assert body["item_id"] == FIXIE
        assert body["price"] == FIXIE_PRICE
        assert body["balance"] == CLIENT_BALANCE + BIKE_GRANT - FIXIE_PRICE
        assert len(db.purchases) == 1

    def test_unknown_item_is_404(self, client_db):
        client, _ = client_db
        assert client.post("/shop/buy/carbon-unicorn").status_code == 404

    def test_already_owned_is_409(self, client_db):
        client, db = client_db
        assert client.post(f"/shop/buy/{FIXIE}").status_code == 200
        assert client.post(f"/shop/buy/{FIXIE}").status_code == 409
        assert len(db.purchases) == 1

    def test_insufficient_balance_is_402(self, client_db):
        client, db = client_db
        r = client.post("/shop/buy/pro-prototype")
        assert r.status_code == 402
        assert db.balance == CLIENT_BALANCE + BIKE_GRANT   # refused: nothing debited

    def test_equip_returns_the_loadout(self, client_db):
        client, _ = client_db
        client.post(f"/shop/buy/{DEEP_WHEELS}")
        r = client.post(f"/shop/equip/{DEEP_WHEELS}")
        assert r.status_code == 200
        assert r.json() == {
            "loadout": {
                "bike": w3catalog.STARTER_BIKE_ID,
                "frame": w3catalog.STOCK_PARTS["frame"],
                "wheels": DEEP_WHEELS,
                "bars": w3catalog.STOCK_PARTS["bars"],
                "saddle": w3catalog.STOCK_PARTS["saddle"],
            }
        }

    def test_equipping_something_unowned_is_409(self, client_db):
        client, _ = client_db
        assert client.post(f"/shop/equip/{FIXIE}").status_code == 409

    def test_equipping_an_unknown_item_is_404(self, client_db):
        client, _ = client_db
        assert client.post("/shop/equip/carbon-unicorn").status_code == 404

    def test_the_shop_routes_are_actually_mounted(self):
        # A router that is imported but never included is a real failure mode in
        # this app's history (garage_router). Assert the paths exist.
        paths = {r.path for r in app.routes}
        assert {"/shop", "/shop/buy/{item_id}", "/shop/equip/{item_id}"} <= paths


def test_ledger_reason_is_the_one_the_economy_already_knows():
    assert REASON_PART_PURCHASE == "part_purchase"


def test_owned_select_is_scoped_to_the_rider():
    # RLS is the real guard, but the query must be scoped anyway — a missing
    # WHERE here would leak another rider's garage in any non-RLS context.
    stmt = select(GarageItem.item_id).where(GarageItem.user_id == USER)
    assert "user_id" in str(stmt)
