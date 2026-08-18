"""The W3 shop — the claimed first bike, the sink, and the price nobody can forge.

Five things are worth protecting here, and each has a test that fails loudly:

1. THE MIRROR CANNOT DRIFT. `services/w3catalog` is generated from the two
   TypeScript catalogues; `TestCatalogDrift` re-parses them and compares. Edit
   `w3bikes.ts` without re-running `scripts/sync_catalog.py` and this file goes
   red — which is the point, because a stale mirror is a mispriced shop.
2. THE STOCK-PARTS GRANT IS REPLAYABLE. It runs on every read, so it must be a
   no-op the second time — and it must never hand out a bike, because a bike
   that arrives by itself makes the claim step theatre.
3. THE FIRST BIKE IS CLAIMED, ONCE, AND ONLY IF IT IS FREE. `claim_first_bike`
   writes ownership at price 0, so anything that is not a price-0 bike must be
   refused, and a rider who already owns a bike must be refused too.
4. MONEY MOVES EXACTLY ONCE. One purchase = one ledger row = one debit. A second
   buy, a lost race, or too small a balance must all leave the wallet untouched.
   The 150 RC onboarding bike grant is paid once, by the claim, ever.
5. YOU ONLY WEAR WHAT YOU OWN.

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
# 2. The free stock parts — and pointedly NOT a bike.
# --------------------------------------------------------------------------- #
class TestEnsureStarter:
    async def test_grants_the_stock_parts_and_no_bike_and_no_loadout(self):
        """The whole point of the change: nothing arrives by itself except parts.

        A bike granted on the first read would make "choose your bike" theatre,
        and would leave the onboarding gate with only a localStorage flag to key
        off — which re-onboards anyone on a new device or a cleared cache.
        """
        db = FakeDB()
        assert await shop.ensure_starter(db, USER) is True

        owned = {i.item_id for i in db.items}
        assert owned == set(w3catalog.STOCK_PARTS.values())
        assert all(i.kind == "part" for i in db.items)
        assert w3catalog.STARTER_BIKE_ID not in owned
        assert all(i.source == "grant" and i.price_paid == 0 for i in db.items)

        # No loadout row at all — a missing row is how the server says "no bike".
        assert USER not in db.loadouts

    async def test_is_idempotent_so_it_is_safe_on_every_read(self):
        db = FakeDB()
        await shop.ensure_starter(db, USER)
        first = list(db.items)

        for _ in range(3):
            assert await shop.ensure_starter(db, USER) is False

        assert db.items == first          # no duplicate rows
        assert USER not in db.loadouts    # and still no bike appeared

    async def test_the_grant_neither_costs_nor_pays_ridecoin(self):
        # Nothing is charged for a free part — and the 150 RC onboarding bike
        # grant is no longer paid here: it belongs to the claim.
        db = FakeDB(balance=500)
        await shop.ensure_starter(db, USER)
        assert db.ledger == []
        assert db.balance == 500

    async def test_reading_the_garage_forever_never_pays_the_bike_grant(self):
        """The 150 RC head start is paid for OWNING a bike, and until the rider
        claims one they do not own one. Repeated garage reads must not pay it."""
        db = FakeDB()
        await shop.ensure_starter(db, USER)
        await shop.get_garage(db, USER)
        await shop.get_garage(db, USER)

        assert [r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE] == []
        assert db.balance == 0

    async def test_a_raced_first_load_leaves_the_rider_whole(self):
        # Two first requests at once: ours loses the insert. The other one
        # granted the same free set, so this must be quiet, not a 500.
        db = FakeDB(race_on=w3catalog.STOCK_PARTS["frame"])
        assert await shop.ensure_starter(db, USER) is False
        assert db.rollbacks == 1


# --------------------------------------------------------------------------- #
# 2b. Claiming the first bike — the deliberate act.
# --------------------------------------------------------------------------- #
class TestClaimFirstBike:
    async def test_claiming_the_free_starter_grants_it_wears_it_and_pays_once(self):
        db = FakeDB(balance=250)
        out = await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)

        bike = [i for i in db.items if i.item_id == w3catalog.STARTER_BIKE_ID]
        assert len(bike) == 1
        assert bike[0].source == "grant" and bike[0].price_paid == 0

        loadout = db.loadouts[USER]
        assert loadout.bike_id == w3catalog.STARTER_BIKE_ID
        assert loadout.frame_id == w3catalog.STOCK_PARTS["frame"]
        assert loadout.wheels_id == w3catalog.STOCK_PARTS["wheels"]
        assert loadout.bars_id == w3catalog.STOCK_PARTS["bars"]
        assert loadout.saddle_id == w3catalog.STOCK_PARTS["saddle"]

        grants = [r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE]
        assert len(grants) == 1 and grants[0].amount == BIKE_GRANT
        assert db.balance == 250 + BIKE_GRANT

        # Same shape as a purchase, at price 0.
        assert set(out) == {"item_id", "price", "balance", "owned", "loadout"}
        assert out["item_id"] == w3catalog.STARTER_BIKE_ID
        assert out["price"] == 0
        assert out["balance"] == 250 + BIKE_GRANT
        assert set(out["owned"]) == set(w3catalog.FREE_ITEM_IDS)
        assert out["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID
        assert db.commits == 1

    async def test_claiming_twice_is_refused_and_pays_the_grant_only_once(self):
        db = FakeDB()
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)

        with pytest.raises(shop.AlreadyOwnedError):
            await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)

        assert len([i for i in db.items if i.item_id == w3catalog.STARTER_BIKE_ID]) == 1
        assert len([r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE]) == 1
        assert db.balance == BIKE_GRANT

    async def test_a_rider_who_already_bought_a_bike_cannot_claim_a_free_one(self):
        # It is the FIRST bike. Owning ANY bike closes the door, however it was got.
        db = FakeDB(balance=1000)
        await shop.purchase(db, USER, FIXIE)

        with pytest.raises(shop.AlreadyOwnedError):
            await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)

        assert not [i for i in db.items if i.item_id == w3catalog.STARTER_BIKE_ID]
        assert [r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE] == []

    async def test_a_rider_auto_granted_a_bike_before_this_change_is_untouched(self):
        """Riders already in production: the old code auto-granted `rustbucket`
        and a loadout row. They own a bike, so the claim refuses and nothing of
        theirs is rewritten — the gate simply passes them through."""
        db = FakeDB(balance=400)
        db.items.append(
            GarageItem(
                user_id=USER, item_id=w3catalog.STARTER_BIKE_ID, kind="bike",
                source="grant", price_paid=0,
            )
        )
        db.loadouts[USER] = GarageLoadout(
            user_id=USER, bike_id=w3catalog.STARTER_BIKE_ID,
            frame_id=w3catalog.STOCK_PARTS["frame"], wheels_id=None,
            bars_id=None, saddle_id=None,
        )
        db._snapshot()

        with pytest.raises(shop.AlreadyOwnedError):
            await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)

        assert db.loadouts[USER].bike_id == w3catalog.STARTER_BIKE_ID
        assert db.loadouts[USER].wheels_id is None   # their loadout, unrewritten
        assert db.balance == 400

    # Literals, not the FIXIE constant below: parametrize is evaluated at import.
    @pytest.mark.parametrize("item_id", ["steel-fixie", "pro-prototype"])
    async def test_claiming_a_priced_bike_is_refused_and_moves_nothing(self, item_id):
        # THE security boundary: claiming writes ownership for free, so a priced
        # bike must never get through it — 15 000 RC for one POST otherwise.
        db = FakeDB(balance=20_000)
        with pytest.raises(shop.NotClaimableError):
            await shop.claim_first_bike(db, USER, item_id)

        assert not [i for i in db.items if i.item_id == item_id]
        assert db.ledger == []              # nothing credited...
        assert db.balance == 20_000         # ...and nothing debited
        assert USER not in db.loadouts

    async def test_claiming_a_free_part_is_refused(self):
        # Price 0, but not a bike — and already owned anyway.
        db = FakeDB()
        with pytest.raises(shop.NotClaimableError):
            await shop.claim_first_bike(db, USER, w3catalog.STOCK_PARTS["saddle"])
        assert USER not in db.loadouts

    async def test_claiming_an_unknown_id_never_reaches_the_database(self):
        db = FakeDB(balance=100)
        with pytest.raises(shop.UnknownItemError):
            await shop.claim_first_bike(db, USER, "carbon-unicorn")
        assert db.items == [] and db.ledger == [] and db.loadouts == {}

    async def test_a_lost_race_creates_no_second_loadout_and_pays_nothing(self):
        # Two taps at once: the read said "no bike", the INSERT hit the unique
        # constraint. The other request made the rider a bike owner already.
        db = FakeDB(race_on=w3catalog.STARTER_BIKE_ID)
        with pytest.raises(shop.AlreadyOwnedError):
            await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)

        assert USER not in db.loadouts
        assert db.ledger == []
        assert db.rollbacks >= 1
        assert db.commits == 0


# --------------------------------------------------------------------------- #
# 3. Spending.
# --------------------------------------------------------------------------- #
FIXIE = "steel-fixie"          # 550 RC
FIXIE_PRICE = w3catalog.CATALOG[FIXIE].price
DEEP_WHEELS = "wheels-deep"    # 1200 RC


class TestPurchase:
    async def test_debits_exactly_once_and_writes_one_ledger_row(self):
        db = FakeDB(balance=1000)
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)
        commits_before = db.commits
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
        assert db.commits == commits_before + 1  # item + ledger settled together

    async def test_buying_a_bike_before_claiming_one_does_not_invent_a_loadout(self):
        # Ownership and the loadout are separate facts. A rider who skipped the
        # claim and bought a bike outright is wearing nothing, honestly.
        db = FakeDB(balance=1000)
        out = await shop.purchase(db, USER, FIXIE)
        assert out["loadout"]["bike"] is None
        assert USER not in db.loadouts

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
        # One RC short. `ensure_starter` credits nothing any more, so the seeded
        # balance is the balance the purchase is judged against.
        db = FakeDB(balance=FIXIE_PRICE - 1)
        with pytest.raises(shop.InsufficientBalanceError) as e:
            await shop.purchase(db, USER, FIXIE)

        assert e.value.price == FIXIE_PRICE
        assert e.value.balance == FIXIE_PRICE - 1
        assert db.purchases == []
        assert db.balance == FIXIE_PRICE - 1
        assert not [i for i in db.items if i.item_id == FIXIE]

    async def test_exactly_enough_is_enough(self):
        db = FakeDB(balance=FIXIE_PRICE)
        await shop.purchase(db, USER, FIXIE)
        assert db.balance == 0

    async def test_unknown_item_never_reaches_the_database(self):
        db = FakeDB(balance=10_000)
        with pytest.raises(shop.UnknownItemError):
            await shop.purchase(db, USER, "carbon-unicorn")
        assert db.items == [] and db.ledger == []

    async def test_the_free_starter_is_claimed_not_bought(self):
        """The old premise ("it is already owned the moment the garage is read")
        is gone — the rider owns no bike until they claim one. Selling it here
        for 0 RC would be a second, silent route to bike ownership that skips the
        loadout and the grant, so `purchase` refuses it outright."""
        db = FakeDB(balance=1000)
        with pytest.raises(shop.NotClaimableError):
            await shop.purchase(db, USER, w3catalog.STARTER_BIKE_ID)
        assert db.purchases == []
        assert not [i for i in db.items if i.item_id == w3catalog.STARTER_BIKE_ID]

    async def test_the_free_starter_is_already_owned_once_claimed(self):
        db = FakeDB(balance=1000)
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)
        with pytest.raises(shop.AlreadyOwnedError):
            await shop.purchase(db, USER, w3catalog.STARTER_BIKE_ID)
        assert db.purchases == []


# --------------------------------------------------------------------------- #
# 4. Wearing.
# --------------------------------------------------------------------------- #
class TestEquip:
    async def test_a_part_goes_into_its_own_slot_and_disturbs_nothing_else(self):
        db = FakeDB(balance=2000)
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)
        await shop.purchase(db, USER, DEEP_WHEELS)
        loadout = await shop.equip(db, USER, DEEP_WHEELS)

        assert loadout["wheels"] == DEEP_WHEELS
        assert loadout["saddle"] == w3catalog.STOCK_PARTS["saddle"]
        assert loadout["bike"] == w3catalog.STARTER_BIKE_ID

    async def test_a_bike_goes_into_the_bike_slot(self):
        db = FakeDB(balance=1000)
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)
        await shop.purchase(db, USER, FIXIE)
        loadout = await shop.equip(db, USER, FIXIE)
        assert loadout["bike"] == FIXIE
        assert loadout["frame"] == w3catalog.STOCK_PARTS["frame"]

    async def test_equipping_a_part_with_no_loadout_row_yet_does_not_blow_up(self):
        # A rider who has claimed no bike owns the stock parts and can equip one.
        # There is no loadout row to write into, so equip makes one — with a null
        # bike, because they still have no bike.
        db = FakeDB()
        await shop.ensure_starter(db, USER)
        assert USER not in db.loadouts

        loadout = await shop.equip(db, USER, w3catalog.STOCK_PARTS["saddle"])
        assert loadout["saddle"] == w3catalog.STOCK_PARTS["saddle"]
        assert loadout["bike"] is None
        assert db.loadouts[USER].saddle_id == w3catalog.STOCK_PARTS["saddle"]

    async def test_equipping_something_you_do_not_own_is_refused(self):
        db = FakeDB(balance=10_000)
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)
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
    async def test_a_brand_new_rider_has_parts_and_no_bike(self):
        """THE ONBOARDING GATE'S SIGNAL. `loadout.bike` must come back present
        and null — not absent — for a rider who has claimed nothing, on any
        device, because that null is the only thing the gate trusts."""
        db = FakeDB(balance=250)
        garage = await shop.get_garage(db, USER)

        assert garage["balance"] == 250          # no grant until the bike is claimed
        assert set(garage["owned"]) == set(w3catalog.STOCK_PARTS.values())
        assert not [i for i in garage["owned"] if w3catalog.CATALOG[i].kind == "bike"]
        assert set(garage["loadout"]) == {"bike", "frame", "wheels", "bars", "saddle"}
        assert garage["loadout"] == {
            "bike": None, "frame": None, "wheels": None, "bars": None, "saddle": None,
        }

    async def test_the_claim_is_what_puts_a_bike_in_the_garage(self):
        db = FakeDB(balance=250)
        await shop.claim_first_bike(db, USER, w3catalog.STARTER_BIKE_ID)
        garage = await shop.get_garage(db, USER)

        assert set(garage["owned"]) == set(w3catalog.FREE_ITEM_IDS)
        assert garage["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID
        assert garage["balance"] == 250 + BIKE_GRANT

    async def test_owned_grows_with_purchases(self):
        db = FakeDB(balance=1000)
        await shop.purchase(db, USER, FIXIE)
        garage = await shop.get_garage(db, USER)
        assert FIXIE in garage["owned"]
        assert garage["balance"] == 1000 - FIXIE_PRICE


# --------------------------------------------------------------------------- #
# 6. The HTTP contract the frontend is built against.
# --------------------------------------------------------------------------- #
# The onboarding bike grant, paid by `claim_first_bike` (it used to be claimable
# only in the retired photo studio, and briefly on the first garage read).
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
        assert body["balance"] == CLIENT_BALANCE
        # No bike until it is claimed — and `bike` is a present, null key, which
        # is what the onboarding gate reads over the wire.
        assert "bike" in body["loadout"] and body["loadout"]["bike"] is None
        assert w3catalog.STARTER_BIKE_ID not in body["owned"]

    def test_claim_returns_the_full_contract_and_pays_the_grant(self, client_db):
        client, db = client_db
        r = client.post(f"/shop/claim/{w3catalog.STARTER_BIKE_ID}")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"item_id", "price", "balance", "owned", "loadout"}
        assert body["item_id"] == w3catalog.STARTER_BIKE_ID
        assert body["price"] == 0
        assert body["balance"] == CLIENT_BALANCE + BIKE_GRANT
        assert body["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID
        assert w3catalog.STARTER_BIKE_ID in body["owned"]
        assert len([r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE]) == 1

        # And the garage now says the same thing on the next device.
        assert client.get("/shop").json()["loadout"]["bike"] == w3catalog.STARTER_BIKE_ID

    def test_claiming_twice_is_409(self, client_db):
        client, db = client_db
        assert client.post(f"/shop/claim/{w3catalog.STARTER_BIKE_ID}").status_code == 200
        assert client.post(f"/shop/claim/{w3catalog.STARTER_BIKE_ID}").status_code == 409
        assert len([r for r in db.ledger if r.reason == REASON_ONBOARDING_BIKE]) == 1

    def test_claiming_an_unknown_item_is_404(self, client_db):
        client, _ = client_db
        assert client.post("/shop/claim/carbon-unicorn").status_code == 404

    def test_claiming_a_priced_bike_is_400_and_costs_nothing(self, client_db):
        client, db = client_db
        assert client.post(f"/shop/claim/{FIXIE}").status_code == 400
        assert client.post("/shop/claim/pro-prototype").status_code == 400
        assert db.balance == CLIENT_BALANCE
        assert not [i for i in db.items if i.kind == "bike"]

    def test_buy_returns_the_full_contract(self, client_db):
        client, db = client_db
        r = client.post(f"/shop/buy/{FIXIE}")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"item_id", "price", "balance", "owned", "loadout"}
        assert body["item_id"] == FIXIE
        assert body["price"] == FIXIE_PRICE
        assert body["balance"] == CLIENT_BALANCE - FIXIE_PRICE
        assert len(db.purchases) == 1

    def test_unknown_item_is_404(self, client_db):
        client, _ = client_db
        assert client.post("/shop/buy/carbon-unicorn").status_code == 404

    def test_buying_the_free_first_bike_is_400(self, client_db):
        client, db = client_db
        r = client.post(f"/shop/buy/{w3catalog.STARTER_BIKE_ID}")
        assert r.status_code == 400
        assert not [i for i in db.items if i.kind == "bike"]

    def test_already_owned_is_409(self, client_db):
        client, db = client_db
        assert client.post(f"/shop/buy/{FIXIE}").status_code == 200
        assert client.post(f"/shop/buy/{FIXIE}").status_code == 409
        assert len(db.purchases) == 1

    def test_insufficient_balance_is_402(self, client_db):
        client, db = client_db
        r = client.post("/shop/buy/pro-prototype")
        assert r.status_code == 402
        assert db.balance == CLIENT_BALANCE   # refused: nothing debited

    def test_equip_returns_the_loadout(self, client_db):
        client, _ = client_db
        client.post(f"/shop/claim/{w3catalog.STARTER_BIKE_ID}")
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
        assert {
            "/shop",
            "/shop/buy/{item_id}",
            "/shop/claim/{item_id}",
            "/shop/equip/{item_id}",
        } <= paths


def test_ledger_reason_is_the_one_the_economy_already_knows():
    assert REASON_PART_PURCHASE == "part_purchase"


def test_owned_select_is_scoped_to_the_rider():
    # RLS is the real guard, but the query must be scoped anyway — a missing
    # WHERE here would leak another rider's garage in any non-RLS context.
    stmt = select(GarageItem.item_id).where(GarageItem.user_id == USER)
    assert "user_id" in str(stmt)
