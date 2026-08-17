"""clear cached scenes after the art-direction change

Revision ID: st5e9a2c7d1b
Revises: dy4c8b1f7e2a
Create Date: 2026-08-17 16:30:00.000000

The scene art direction changed from "kawaii vinyl toy / chunky toy proportions"
to the restrained, cinematic look the rest of W3 uses (see
`services/cyclr_studio.GENERAL_STYLE` and `services/ride_scene._POSE`). Cached
rows in `day_scenes` and `ride_scenes` still hold images rendered under the OLD
direction, and both caches are keyed on pose / activity — not on the style — so
without this every existing rider would keep the childish art forever.

Deleting the rows is safe and cheap: the scene is derived data, every row can be
regenerated on demand from the rider's garage assets, and the deterministic seed
means an identical request reproduces an identical image. The cost is that the
next request per pose composes again.

Nothing else is touched — `garage_assets` (the rider figure and bike) survives,
so nobody has to re-upload anything.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "st5e9a2c7d1b"
down_revision: Union[str, Sequence[str], None] = "dy4c8b1f7e2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM day_scenes;")
    op.execute("DELETE FROM ride_scenes;")


def downgrade() -> None:
    # Nothing to restore: the deleted rows were a regenerable cache, and the
    # old-style images cannot be reconstructed from the new prompts anyway.
    pass
