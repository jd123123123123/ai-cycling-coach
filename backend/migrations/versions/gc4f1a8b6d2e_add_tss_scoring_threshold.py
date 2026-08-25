"""activities.ftp_watts_at_scoring: record the unit TSS is measured in, and recover it for history

Revision ID: gc4f1a8b6d2e
Revises: gb3d9e2f7a1c
Create Date: 2026-08-25

TSS is defined relative to a threshold:

    TSS = duration_s × NP² / (FTP² × 3600) × 100

so a stored TSS means nothing without the FTP that produced it. This app
computed TSS at ingestion using whatever FTP was set that day and stored the
number bare; `recompute_missing_tss` only ever touched NULL rows, so past load
kept the units it was scored in and nothing recorded what those were.

CTL is a 42-day exponential average of those numbers. Across a season in which
an athlete improved 10%, "CTL 85" in March and "CTL 85" in August are not the
same training — the second is roughly 20% more work, because the same watts
score lower against a higher threshold. Every longitudinal claim the product
makes rested on an unstated change of units (audit §7.2).

THE HISTORY IS NOT LOST, ONLY UNLABELLED. `normalized_power`, `average_power`
and `duration_seconds` are already stored on the activity, so the threshold can
be RECOVERED by inverting the arithmetic that produced the stored TSS:

    FTP = NP × sqrt(dur / (36 × TSS))

That is exact, not an estimate — it returns the very number that was used. The
backfill below applies it to every power-scored cycling activity.

WHERE IT REFUSES TO ANSWER. An hrTSS ride has no FTP behind its number, and a
manual or corrupt row can produce nonsense. The backfill keeps a recovered
value only inside a plausible band (50–600 W); everything else stays NULL,
which callers must read as "unit unknown, do not convert". A wrong unit written
here would silently corrupt every re-basing that followed, so NULL is the
correct answer whenever the arithmetic cannot vouch for itself.

This migration only labels history. It does NOT change any stored TSS, so no
athlete's CTL moves as a result of running it — as-scored remains the load
model's dose, which is the physiologically correct one (a ride at threshold WAS
threshold work). Re-basing is now *possible*, deliberately, rather than
automatic.
"""
from alembic import op
import sqlalchemy as sa

revision = "gc4f1a8b6d2e"
down_revision = "gb3d9e2f7a1c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column("ftp_watts_at_scoring", sa.Float(), nullable=True),
    )

    # Recover the threshold for every power-scored cycling ride.
    #
    # `COALESCE(normalized_power, average_power)` mirrors the scoring path:
    # `_compute_tss` prefers NP and falls back to average power as an NP
    # estimate, so the inverse has to consider the same value.
    #
    # The plausibility band is what keeps an hrTSS row from being labelled with
    # a fabricated threshold.
    op.execute(
        """
        UPDATE activities
        SET ftp_watts_at_scoring = ROUND(
            (COALESCE(normalized_power, average_power)
             * SQRT(duration_seconds::numeric / (36.0 * tss::numeric)))::numeric, 1
        )
        WHERE sport = 'cycling'
          AND tss IS NOT NULL AND tss > 0
          AND duration_seconds IS NOT NULL AND duration_seconds > 0
          AND COALESCE(normalized_power, average_power) IS NOT NULL
          AND COALESCE(normalized_power, average_power) > 0
          AND (COALESCE(normalized_power, average_power)
               * SQRT(duration_seconds::numeric / (36.0 * tss::numeric)))
              BETWEEN 50 AND 600
        """
    )


def downgrade() -> None:
    op.drop_column("activities", "ftp_watts_at_scoring")
