"""Alltagsprofil: work_rhythm auf athlete_profiles

Der Plan erfuhr von einer Pendelfahrt bisher erst, wenn sie gefahren und
synchronisiert war -- er reagierte also nachtraeglich und beschnitt die Woche
hinterher, wobei er Qualitaetseinheiten traf. Mit Arbeitstagen, Arbeitszeiten
und Pendeldauer wird diese Grundlagenlast vorhersagbar.

Ein JSONB-Feld statt einer eigenen Tabelle: Die Angaben gehoeren demselben
Athleten wie `days_available` und `hard_day_blackouts` daneben, sie werden immer
zusammen gelesen, und eine Tabelle mehr waere eine Verknuepfung mehr ohne
Gegenwert.

Revision ID: wr1a2b3c4d5e
Revises: sd7a4e9c1b23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "wr1a2b3c4d5e"
down_revision = "sd7a4e9c1b23"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column("work_rhythm", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("athlete_profiles", "work_rhythm")
