"""add day scenes (today's hero, cached per pose)

Revision ID: dy4c8b1f7e2a
Revises: ga7b1e4c9d3f
Create Date: 2026-08-17 09:00:00.000000

Today's hero shows the rider ON their bike in a scene that matches what the day
is asking of them (asleep on the bike on a rest day, flat out on a hard one).
Composing that is the same slow paid image-model call `ride_scenes` already
caches — but it is not about an activity, so it cannot hang off one.

`day_scenes` caches it per (user, pose), where pose is one of
`services/ride_scene.DAY_POSES`. A rider ends up with at most seven rows for
their whole membership, and every later day in the same state reads the image
back for free. A per-date key would have billed a fresh render every morning for
a picture identical to yesterday's.

No foreign key to activities exists here at all (this table has no activity), so
none of the Timescale composite-PK trouble applies. RLS via user_id, the same
policy shape as garage_assets / ride_scenes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "dy4c8b1f7e2a"
down_revision: Union[str, Sequence[str], None] = "ga7b1e4c9d3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "day_scenes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("pose", sa.String(length=16), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("training_context", sa.Text(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "pose", name="uq_day_scene_user_pose"),
    )
    op.create_index(
        op.f("ix_day_scenes_user_id"), "day_scenes", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE day_scenes ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON day_scenes
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON day_scenes;")
    op.execute("ALTER TABLE day_scenes DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_day_scenes_user_id"), table_name="day_scenes")
    op.drop_table("day_scenes")
