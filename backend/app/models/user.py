from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.athlete_profile import AthleteProfile
    from app.models.consent import ConsentRecord
    from app.models.garmin_credential import GarminCredential
    from app.models.daily_metric import DailyMetric
    from app.models.planned_workout import PlannedWorkout
    from app.models.daily_metric_sample import DailyMetricSample


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    # Optional real display name; falls back to the email-derived handle when null.
    display_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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

    # Relationships activated in Phase 2 when models were added
    athlete_profile: Mapped["AthleteProfile | None"] = relationship(
        "AthleteProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        "ConsentRecord",
        back_populates="user",
        # No cascade delete — anonymize consent records on user deletion
    )
    activities: Mapped[list["Activity"]] = relationship(
        "Activity",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    garmin_credential: Mapped["GarminCredential | None"] = relationship(
        "GarminCredential",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    daily_metrics: Mapped[list["DailyMetric"]] = relationship(
        "DailyMetric",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    planned_workouts: Mapped[list["PlannedWorkout"]] = relationship(  # noqa: F821
        "PlannedWorkout",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    daily_metric_samples: Mapped[list["DailyMetricSample"]] = relationship(
        "DailyMetricSample",
        back_populates="user",
        cascade="all, delete-orphan",
    )
