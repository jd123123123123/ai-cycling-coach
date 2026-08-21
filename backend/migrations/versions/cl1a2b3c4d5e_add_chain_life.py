"""the chain's second clock: life to 0,5 % elongation, and the readings that calibrate it

Revision ID: cl1a2b3c4d5e
Revises: df2c6e0a71b4
Create Date: 2026-08-21 01:20:00.000000

`km_since_service` says when the chain needs CLEANING. Nothing so far says when
it is FINISHED — and that is the expensive deadline: past ~0,5 % elongation the
chain machines new spacing into the cassette, turning a chain purchase into a
chain-plus-cassette purchase.

Two additions, both purely additive to a live table:

  · ``bike_components.life_km`` — weighted kilometres since the physical part
    was fitted. Survives every service; only a replacement resets it. Existing
    rows start at 0, which is the honest reading: we know when the rider last
    serviced, we have never been told when they last REPLACED, and backfilling
    it from ``km_total`` would date every chain in the fleet from the day the
    odometer started rather than the day the chain was fitted.

  · ``component_measurements`` — one chain-checker reading plus the odometer it
    was taken at. That pairing is what turns a generic interval into this
    rider's own (see `bike_wear.calibrate_life`).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "cl1a2b3c4d5e"
down_revision: Union[str, Sequence[str], None] = "df2c6e0a71b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bike_components",
        sa.Column("life_km", sa.Float(), nullable=False, server_default="0"),
    )

    op.create_table(
        "component_measurements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("component_id", sa.String(length=32), nullable=False),
        sa.Column("measured_pct", sa.Float(), nullable=False),
        sa.Column("life_km_at", sa.Float(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_component_measurements_user_id"),
        "component_measurements", ["user_id"], unique=False,
    )
    op.create_index(
        op.f("ix_component_measurements_component_id"),
        "component_measurements", ["component_id"], unique=False,
    )

    op.execute("ALTER TABLE component_measurements ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON component_measurements
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON component_measurements;")
    op.execute("ALTER TABLE component_measurements DISABLE ROW LEVEL SECURITY;")
    op.drop_index(
        op.f("ix_component_measurements_component_id"), table_name="component_measurements",
    )
    op.drop_index(
        op.f("ix_component_measurements_user_id"), table_name="component_measurements",
    )
    op.drop_table("component_measurements")
    op.drop_column("bike_components", "life_km")
