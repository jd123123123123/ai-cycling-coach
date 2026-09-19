import logging
from datetime import date as date_type
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.garmin_credential import GarminCredential
from app.models.user import User
from app.schemas.athlete import AthleteProfileRead, AthleteProfileUpdate
from app.services.athlete_service import get_or_create_profile, update_profile
from app.services.garmin_sync_service import sync_user_garmin
from app.services.streak import build_streak, repair_streak

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/athletes", tags=["athletes"])


@router.get("/me", response_model=AthleteProfileRead)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Get the current user's athlete profile. Creates an empty profile if none exists."""
    profile = await get_or_create_profile(db, current_user.id)
    return profile


@router.put("/me", response_model=AthleteProfileRead)
async def update_my_profile(
    data: AthleteProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Update the current user's athlete profile fields (partial update)."""
    profile = await update_profile(db, current_user.id, data)
    return profile


# ─── Pendelbefund — der Arbeitsweg aus den Fahrten, nicht aus einer Frage ────


class CommutePatternRead(BaseModel):
    """Was die Fahrten ueber den Arbeitsweg sagen.

    `detected=False` heisst: zu wenig Substanz fuer eine Aussage. Dann bleibt
    das Formular leer, statt mit geratenen Werten vorbelegt zu werden -- ein
    falsch vorausgefuelltes Feld prueft niemand nach.
    """

    detected: bool = False
    work_days: list[str] = []
    commute_minutes: int | None = None
    earliest: str | None = None
    latest: str | None = None
    rides: int = 0
    pair_ratio: float = 0.0
    confidence: Literal["hoch", "mittel", "niedrig"] = "niedrig"


@router.get("/me/commute-pattern", response_model=CommutePatternRead)
async def my_commute_pattern(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> CommutePatternRead:
    """Den Arbeitsweg aus den letzten Wochen lesen.

    Read-only und folgenlos: der Befund wird NICHT gespeichert. Er fuellt nur
    das Formular vor, und erst die Bestaetigung des Fahrers schreibt etwas --
    was die Maschine erkannt hat, bleibt ein Vorschlag.
    """
    from app.services.commute_detection import detect_commute_pattern

    profile = await get_or_create_profile(db, current_user.id)
    ftp = getattr(profile, "ftp_watts", None)
    try:
        befund = await detect_commute_pattern(db, current_user.id, ftp)
    except Exception:  # noqa: BLE001 — ein Erkennungsfehler darf nichts kippen
        logger.exception("Pendelerkennung fehlgeschlagen (user_id=%s)", current_user.id)
        return CommutePatternRead()
    if befund is None:
        return CommutePatternRead()
    return CommutePatternRead(
        detected=True,
        work_days=befund.wochentage_kuerzel,
        commute_minutes=befund.minuten_je_richtung,
        earliest=befund.frueheste.strftime("%H:%M") if befund.frueheste else None,
        latest=befund.spaeteste.strftime("%H:%M") if befund.spaeteste else None,
        rides=befund.fahrten,
        pair_ratio=befund.paar_anteil,
        confidence=befund.sicherheit,
    )


# ─── Athlete status — forgiving-streak + plan input ─────────────────────────
# "sick" / "injured" / "break" pause the streak (never break it) and push the
# adaptive directive to rest, which in turn mutes competitive surfaces via the
# coach-safety interlock. "healthy" clears the status.

AthleteState = Literal["healthy", "sick", "injured", "break"]


class AthleteStatusUpdate(BaseModel):
    state: AthleteState


class AthleteStatusRead(BaseModel):
    state: AthleteState
    since: date_type | None = None


@router.put("/me/status", response_model=AthleteStatusRead)
async def set_my_status(
    payload: AthleteStatusUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteStatusRead:
    """Set the athlete's life status. Stored in the profile's goals JSONB
    (additive — no migration); `healthy` removes it."""
    profile = await get_or_create_profile(db, current_user.id)
    goals = dict(profile.goals or {})
    if payload.state == "healthy":
        goals.pop("athlete_status", None)
        result = AthleteStatusRead(state="healthy", since=None)
    else:
        existing = goals.get("athlete_status") or {}
        # Keep the original `since` when re-affirming the same state.
        since = (
            existing.get("since")
            if existing.get("state") == payload.state and existing.get("since")
            else date_type.today().isoformat()
        )
        goals["athlete_status"] = {"state": payload.state, "since": since}
        result = AthleteStatusRead(state=payload.state, since=date_type.fromisoformat(since))
    profile.goals = goals
    flag_modified(profile, "goals")
    await db.commit()
    return result


@router.get("/me/streak")
async def my_streak(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> dict:
    """Plan-aware forgiving streak: trained days and planned rest days extend
    it, sick/injured/break days pause it, only a skipped planned session (or an
    unplanned gap) breaks it. Includes per-day states for the current week and
    `consistency: {met, planned}` — planned training days met so far vs planned
    training days in the whole athlete-local week (P1-11: planned rest days
    never count against, future days are never 'missed')."""
    return await build_streak(db, current_user.id)


# ─── One-tap morning-after streak repair (backlog 03·C2) ────────────────────
# The soft streak-break card offers a kind, HONEST recovery: the most common
# false break is a ride the athlete really did but Garmin hadn't synced yet when
# the break was computed. This endpoint triggers a fresh sync (best-effort) and
# RE-EVALUATES the streak against real activities — it restores only when a
# qualifying ride for the missed day now exists, never a manipulative free undo.


class StreakRepairResult(BaseModel):
    """Outcome of a morning-after repair re-check."""

    repaired: bool
    # "restored" — a real ride now covers the missed day, the streak stands.
    # "nothing_to_repair" — the missed day still has no qualifying ride (honest).
    reason: Literal["restored", "nothing_to_repair"]
    streak: int
    repaired_date: date_type | None = None
    # Whether a fresh Garmin sync actually ran during this check (best-effort;
    # false when no account is connected or a sync was already in flight).
    synced: bool = False


@router.post("/me/streak/repair", response_model=StreakRepairResult)
async def repair_my_streak(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> StreakRepairResult:
    """Re-evaluate the just-broken streak after a fresh sync (backlog 03·C2).

    Best-effort pulls any late-arriving ride from a connected Garmin account,
    then honestly re-checks the streak: it restores ONLY when a real qualifying
    activity for the missed day now exists. If no such ride exists, it returns
    ``nothing_to_repair`` — it never buys back a streak that wasn't earned."""
    # 1. Best-effort fresh sync so a late ride is pulled in before we re-check.
    #    Non-fatal: a failed/absent sync just means we re-check existing data
    #    (which already includes Coros/Wahoo/Apple/manual activities).
    synced = False
    cred_row = await db.execute(
        select(GarminCredential).where(GarminCredential.user_id == current_user.id)
    )
    credential = cred_row.scalar_one_or_none()
    # Capture the day that broke the streak BEFORE syncing, so we can tell
    # whether a freshly-arrived ride actually covers it.
    pre = await build_streak(db, current_user.id)
    prior_break_day = pre.get("break_day")

    if credential is not None and credential.sync_status != "syncing":
        try:
            await sync_user_garmin(db, credential)
            synced = True
        except Exception as exc:  # noqa: BLE001 — repair still runs on stale data
            logger.warning(
                "Streak-repair sync failed for user_id=%s (re-checking existing data): %s",
                current_user.id,
                exc,
            )

    # 2. Honest re-evaluation against real activities + the plan.
    result = await repair_streak(db, current_user.id, prior_break_day)
    return StreakRepairResult(synced=synced, **result)


# ── THE THRESHOLD PROPOSAL ───────────────────────────────────────────────
# FTP is the unit every other number in this app is measured in — zones, TSS,
# CTL, every prescribed interval. So the system may NOTICE that it moved, must
# SHOW its working, and must ASK. It never writes the number by itself.
# See `services/threshold_proposal` and audit §7.1.


class ThresholdEvidenceRead(BaseModel):
    kind: str
    watts: float
    text: str


class ThresholdProposalRead(BaseModel):
    available: bool
    current_watts: int | None = None
    proposed_watts: int | None = None
    delta_watts: int | None = None
    delta_pct: float | None = None
    direction: str | None = None
    confidence: str | None = None
    headline: str | None = None
    body: str | None = None
    evidence: list[ThresholdEvidenceRead] = []


class ThresholdDecision(BaseModel):
    watts: int


async def _threshold_proposal(db: AsyncSession, user_id: int, profile):
    """Gather the evidence and build the proposal, or None."""
    from app.services.athlete_power_profile import compute_athlete_power_profile
    from app.services.threshold_proposal import build_proposal

    pp = await compute_athlete_power_profile(db, user_id, profile=profile) or {}
    curve = pp.get("mmp_curve") or {}
    # The classic field test lives at 20 minutes. `mmp_curve` keys may arrive as
    # ints or strings depending on the JSON round-trip.
    best_20 = curve.get(1200) or curve.get("1200")

    goals = dict(getattr(profile, "goals", None) or {})
    dismissed = (goals.get("threshold_proposal") or {}).get("dismissed_watts")

    return build_proposal(
        current_ftp=getattr(profile, "ftp_watts", None),
        best_20min_w=float(best_20) if best_20 else None,
        eftp_w=pp.get("eftp_watts"),
        cp_se_w=pp.get("cp_se_watts"),
        cp_identifiable=bool(pp.get("identifiable")),
        model_rides=int(pp.get("n_rides") or 0),
        dismissed_watts=float(dismissed) if dismissed else None,
    )


@router.get("/me/threshold-proposal", response_model=ThresholdProposalRead)
async def get_threshold_proposal(
    locale: str = "de",
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> ThresholdProposalRead:
    """Does the evidence say this athlete's threshold has moved?

    `available: false` is the normal answer and carries nothing else — no
    proposal is the honest state most of the time.
    """
    profile = await get_or_create_profile(db, current_user.id)
    p = await _threshold_proposal(db, current_user.id, profile)
    if p is None:
        return ThresholdProposalRead(available=False)
    de = str(locale).lower().startswith("de")
    return ThresholdProposalRead(
        available=True,
        current_watts=p.current_watts,
        proposed_watts=p.proposed_watts,
        delta_watts=p.delta_watts,
        delta_pct=p.delta_pct,
        direction=p.direction,
        confidence=p.confidence,
        headline=p.headline_de if de else p.headline_en,
        body=p.body_de if de else p.body_en,
        evidence=[
            ThresholdEvidenceRead(kind=e.kind, watts=round(e.watts, 1), text=(e.de if de else e.en))
            for e in p.evidence
        ],
    )


@router.post("/me/threshold-proposal/accept", response_model=AthleteProfileRead)
async def accept_threshold_proposal(
    payload: ThresholdDecision,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """The athlete said yes. THIS is the only path that writes `ftp_watts` from
    the model — and it runs because a human pressed it.

    The value is re-derived server-side rather than trusted from the client: the
    proposal is evidence-gated, and accepting one must not become a way to set
    an arbitrary threshold. A body that disagrees with the current evidence is
    refused.
    """
    from fastapi import HTTPException

    profile = await get_or_create_profile(db, current_user.id)
    p = await _threshold_proposal(db, current_user.id, profile)
    if p is None or p.proposed_watts != payload.watts:
        raise HTTPException(
            status_code=409,
            detail="That proposal is no longer current — reload it before accepting.",
        )

    goals = dict(profile.goals or {})
    goals["threshold_proposal"] = {
        "accepted_watts": p.proposed_watts,
        "previous_watts": p.current_watts,
        "accepted_at": date_type.today().isoformat(),
    }
    profile.goals = goals
    flag_modified(profile, "goals")
    # Past activities keep the unit they were scored in — see
    # `activities.ftp_watts_at_scoring`. Only future rides use the new number.
    updated = await update_profile(db, current_user.id, {"ftp_watts": p.proposed_watts})
    return updated


@router.post("/me/threshold-proposal/dismiss", response_model=ThresholdProposalRead)
async def dismiss_threshold_proposal(
    payload: ThresholdDecision,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> ThresholdProposalRead:
    """"Not now." Remembered, so the same number is not raised again tomorrow —
    a genuinely different one still will be."""
    profile = await get_or_create_profile(db, current_user.id)
    goals = dict(profile.goals or {})
    goals["threshold_proposal"] = {
        "dismissed_watts": payload.watts,
        "dismissed_at": date_type.today().isoformat(),
    }
    profile.goals = goals
    flag_modified(profile, "goals")
    await db.commit()
    return ThresholdProposalRead(available=False)
