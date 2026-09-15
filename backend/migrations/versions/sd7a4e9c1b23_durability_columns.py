"""activity_stream: durability_drop_pct und durability_kj_per_kg

Der Wert wurde seit jeher in `analyze_streams` gerechnet und beim Speichern
weggeworfen. Drei Verbraucher warten darauf (race_debrief, fueling_analysis,
rehearsal/uncertainty) und die Phaenotyp-Kachel zeigte ohne ihn eine erfundene 50.

Additiv und nullable: bestehende Zeilen bleiben NULL, und NULL heisst hier
ausdruecklich "nicht gemessen", nicht "null Abfall". Backfill passiert von
selbst, sobald eine Fahrt neu analysiert wird.

Revision ID: sd7a4e9c1b23
Revises: rr5e1b8c94d7
"""
from alembic import op
import sqlalchemy as sa

revision = "sd7a4e9c1b23"
down_revision = "rr5e1b8c94d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activity_streams",
        sa.Column("durability_drop_pct", sa.Float(), nullable=True),
    )
    op.add_column(
        "activity_streams",
        sa.Column("durability_kj_per_kg", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activity_streams", "durability_kj_per_kg")
    op.drop_column("activity_streams", "durability_drop_pct")
