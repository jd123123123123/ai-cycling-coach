"""The sealed chest: a ride's coins wait until the rider opens the ride.

What these pin down is the one thing a currency must never get wrong — that
the coins are paid exactly once, and only when the rider acts. Everything else
about the mechanic is presentation; this is the arithmetic.
"""
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from app.models.rewards import PointsLedger, Wallet
from app.services import rewards


class FakeSession:
    """Enough session for the credit/claim paths: rows in, rows out."""

    def __init__(self, ledger=(), wallet=None):
        self.ledger = list(ledger)
        self.wallet = wallet
        self.added = []

    async def execute(self, stmt, *a, **k):
        text = str(stmt)
        result = MagicMock()
        if "FROM wallets" in text:
            result.scalar_one_or_none.return_value = self.wallet
            result.scalars.return_value.all.return_value = [self.wallet] if self.wallet else []
        else:
            rows = list(self.ledger)
            result.scalars.return_value.all.return_value = rows
            result.scalars.return_value.first.return_value = rows[0] if rows else None
            result.first.return_value = (rows[0],) if rows else None
        return result

    async def get(self, model, pk):
        return self.wallet if model is Wallet else None

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, PointsLedger):
            self.ledger.append(obj)
        if isinstance(obj, Wallet):
            self.wallet = obj

    async def flush(self):
        return None


def line(reason, amount, *, activity_id=7, claimed=False, minutes_ago=0):
    row = PointsLedger(
        user_id=1, reason=reason, amount=amount, activity_id=activity_id,
        claimed_at=datetime.now(UTC) if claimed else None,
    )
    row.created_at = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    row.id = abs(hash((reason, amount, activity_id, minutes_ago))) % 10_000
    return row


class TestWhatWaitsAndWhatDoesNot:
    def test_a_rides_earnings_wait(self):
        for reason in ("ride_earn", "streak_bonus", "gear_bonus", "eddington"):
            assert rewards._waits_in_chest(reason, 7, 40) is True

    def test_a_credit_with_no_ride_behind_it_lands_immediately(self):
        # An onboarding grant or a referral cut has no moment to be saved for.
        assert rewards._waits_in_chest("ride_earn", None, 40) is False
        assert rewards._waits_in_chest("referral_bonus", 7, 40) is False
        assert rewards._waits_in_chest("service_bonus", None, 150) is False

    def test_a_spend_never_waits(self):
        # Holding a debit would mean a rider could buy something and not pay
        # for it until they opened a ride.
        assert rewards._waits_in_chest("part_purchase", 7, -400) is False


class TestCredit:
    @pytest.mark.asyncio
    async def test_a_ride_credit_writes_the_line_but_not_the_balance(self):
        db = FakeSession(wallet=Wallet(user_id=1, balance=1_000))
        row = await rewards._credit(db, 1, "ride_earn", 84, activity_id=7)
        assert row.claimed_at is None
        assert db.wallet.balance == 1_000  # untouched until it is opened

    @pytest.mark.asyncio
    async def test_a_non_ride_credit_moves_the_balance_at_once(self):
        db = FakeSession(wallet=Wallet(user_id=1, balance=1_000))
        row = await rewards._credit(db, 1, "service_bonus", 150)
        assert row.claimed_at is not None
        assert db.wallet.balance == 1_150

    @pytest.mark.asyncio
    async def test_a_spend_still_debits_immediately(self):
        db = FakeSession(wallet=Wallet(user_id=1, balance=1_000))
        await rewards._credit(db, 1, "part_purchase", -400, activity_id=7)
        assert db.wallet.balance == 600


class TestSealedChest:
    @pytest.mark.asyncio
    async def test_nothing_waiting_is_no_chest(self):
        assert await rewards.sealed_chest(FakeSession([]), 1) is None

    @pytest.mark.asyncio
    async def test_the_chest_sums_only_its_own_ride(self):
        db = FakeSession([
            line("ride_earn", 84, activity_id=7, minutes_ago=1),
            line("streak_bonus", 12, activity_id=7, minutes_ago=1),
            line("ride_earn", 60, activity_id=6, minutes_ago=900),
        ])
        chest = await rewards.sealed_chest(db, 1)
        assert chest["activity_id"] == 7
        assert chest["total"] == 96
        assert [ln["reason"] for ln in chest["lines"]] == ["ride_earn", "streak_bonus"]

    @pytest.mark.asyncio
    async def test_older_unopened_rides_are_counted_but_not_shown(self):
        db = FakeSession([
            line("ride_earn", 84, activity_id=7, minutes_ago=1),
            line("ride_earn", 60, activity_id=6, minutes_ago=900),
            line("ride_earn", 40, activity_id=5, minutes_ago=4000),
        ])
        chest = await rewards.sealed_chest(db, 1)
        assert chest["waiting"] == 3
        assert chest["total"] == 84  # the newest ride only


class TestClaim:
    @pytest.mark.asyncio
    async def test_claiming_banks_every_line_of_that_ride(self):
        rows = [line("ride_earn", 84), line("streak_bonus", 12), line("gear_bonus", 9)]
        db = FakeSession(rows, wallet=Wallet(user_id=1, balance=1_000))
        result = await rewards.claim_ride(db, 1, 7)
        assert result["claimed"] == 105
        assert db.wallet.balance == 1_105
        assert all(r.claimed_at is not None for r in rows)

    @pytest.mark.asyncio
    async def test_claiming_twice_pays_once(self):
        rows = [line("ride_earn", 84)]
        db = FakeSession(rows, wallet=Wallet(user_id=1, balance=0))
        first = await rewards.claim_ride(db, 1, 7)
        # The second call sees no unclaimed lines — the stamp is the guard.
        db.ledger = [r for r in rows if r.claimed_at is None]
        second = await rewards.claim_ride(db, 1, 7)
        assert (first["claimed"], second["claimed"]) == (84, 0)
        assert db.wallet.balance == 84

    @pytest.mark.asyncio
    async def test_claiming_an_empty_chest_is_not_an_error(self):
        db = FakeSession([], wallet=Wallet(user_id=1, balance=500))
        result = await rewards.claim_ride(db, 1, 999)
        assert result == {"activity_id": 999, "claimed": 0, "balance": 500}

    @pytest.mark.asyncio
    async def test_a_rider_with_no_wallet_yet_gets_one(self):
        db = FakeSession([line("ride_earn", 84)], wallet=None)
        result = await rewards.claim_ride(db, 1, 7)
        assert result["claimed"] == 84
        assert db.wallet.balance == 84
