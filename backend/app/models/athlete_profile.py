from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AthleteProfile(Base):
    __tablename__ = "athlete_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Cycling thresholds
    ftp_watts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lthr_cycling: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Running thresholds
    running_threshold_pace_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    lthr_running: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # General
    max_heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resting_heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String, nullable=True)

    # Training availability
    weekly_hours_available: Mapped[float | None] = mapped_column(Float, nullable=True)
    primary_sport: Mapped[str | None] = mapped_column(String(20), nullable=True)
    secondary_sports: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # ── Plan-engine v2 profile inputs (July 2026) ─────────────────────────
    # All nullable: onboarding stays at 3 screens — hours + days are the only
    # load-bearing additions asked up front (a feasible plan needs to know
    # which days exist); the rest defaults from the depth selector and is
    # LEARNED from behavior, never interrogated.
    #
    # days_available — weekday flags + the athlete's long-ride day:
    #   {"mon": true, ..., "sun": true, "long_day": "sat"}
    #   WHY: implementation intentions (Gollwitzer & Sheeran 2006) — the
    #   weekly skeleton must land hard/long days on real free days, and the
    #   long day breaks the uniform per-day time window that locks out every
    #   ride ≥150 min (Z2-degeneration culprit #3).
    days_available: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # motivation_style — 'race_focused' | 'fitness_builder' | 'fun_variety'.
    #   WHY: identity-based habits + SDT autonomy support; biases archetype
    #   rotation and copy register. Defaulted from the onboarding depth
    #   selector (Guide me → fun_variety bias, Full pro → race_focused).
    motivation_style: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # variety_dial — 'steady' | 'mixed' | 'adventurous'.
    #   WHY: novelty is a candidate psychological need (González-Cutre);
    #   drives how aggressively the template rotation varies week to week.
    variety_dial: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # experience_level — 'new' | 'returning' | 'seasoned'.
    #   WHY: separates "CTL is low because detrained" from "CTL is low
    #   because novice" — a returning athlete tolerates a steeper ramp.
    experience_level: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # hard_day_blackouts — weekday names on which quality/hard sessions must
    #   never land, e.g. ["mon", "fri"].
    #   WHY: affect-based prescription — a hard day colliding with life
    #   stress is the classic silent-churn trigger.
    hard_day_blackouts: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Goals stored as JSON for flexibility
    # {"target_ftp": int, "target_event": {"name": str, "date": str}, "weekly_hours": float}
    goals: Mapped[dict | None] = mapped_column(JSON, default=dict, nullable=True)

    # Target event — first-class columns for the periodization engine (Phase 7).
    # Supersedes goals.target_event_date; legacy goals JSONB preserved for back-compat.
    # target_event_type values: 'race' | 'fondo' | 'audax' | 'maintenance'
    # target_priority values: 'A' | 'B' | 'C'
    target_event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_event_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_priority: Mapped[str | None] = mapped_column(String(1), nullable=True)

    # FTP history — list of {"ftp_watts": int, "measured_at": str} dicts
    ftp_history: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # IANA timezone string used to compute athlete-local "today" / "this week"
    # windows in coach_service. Nullable + defaults to "Europe/Berlin" at the
    # DB level (single-user MVP); onboarding will start setting this from the
    # browser tz. See today-runthrough Step 2.
    timezone: Mapped[str | None] = mapped_column(
        String(64), nullable=True, server_default="Europe/Berlin"
    )

    # Injury tracking (Phase 5) — when injury_flag is True, safety_rails force
    # intensity_ceiling='rest' regardless of any other signal. The optional note
    # lets the athlete contextualise the flag for themselves and the coach brief.
    injury_flag: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    injury_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="athlete_profile")  # noqa: F821
