"""bike_renders — the composed photograph of a build, cached per BUILD not per rider

Revision ID: br3f8a1c65d2
Revises: cl9b2e7f4a1d
Create Date: 2026-08-18 21:00:00.000000

A part photographed on its own has nowhere to land on a bike photographed on
its own, so equipping something never changed the picture. Builds are now
composed by the same image model that made the catalogue, from the real base
photograph, through the same locked camera.

WHY THERE IS NO user_id, AND NO RLS POLICY. The picture of a lime Rostlaube on
gold rims is the same picture for every rider who builds one. Keying the cache
by the BUILD means a combination is paid for once for the whole user base and is
free forever after — which is the only thing that makes an image model
affordable here. Nothing in the row is private: it holds a catalogue-derived key
and a picture of catalogue parts, so sharing it between riders is the design
rather than a leak. (Every other table in this feature — garage_items,
garage_loadout — is per-rider and stays RLS-protected.)

DATA-SAFE: a new, empty table. Nothing reads it until a build is composed, and a
missing row degrades to the plain catalogue bike, which is exactly what shipped
before this migration.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "br3f8a1c65d2"
down_revision: Union[str, Sequence[str], None] = "cl9b2e7f4a1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bike_renders",
        # "<bike>|<frame>|<wheels>|<bars>|<saddle>", stock slots collapsed to
        # "-". Readable on purpose: a bad render is found and deleted by eye.
        sa.Column("build_key", sa.String(length=255), primary_key=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("image", sa.Text(), nullable=True),
        sa.Column("detail", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # The sweeper that retries failures looks up by status, and the table is
    # read on every non-stock garage open.
    op.create_index("ix_bike_renders_status", "bike_renders", ["status"])


def downgrade() -> None:
    op.drop_index("ix_bike_renders_status", table_name="bike_renders")
    op.drop_table("bike_renders")
