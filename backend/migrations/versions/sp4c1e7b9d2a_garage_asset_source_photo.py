"""garage_assets keeps the rider's own photo, so a re-render is still them

Revision ID: sp4c1e7b9d2a
Revises: hd5e2b7c9f31
Create Date: 2026-08-27 09:00:00.000000

Until now the only thing that survived onboarding was `garage_assets.description`
— about 120 words of prose from the vision pass. Everything downstream rendered
the rider through that bottleneck: `/garage/asset/{kind}/restyle` re-renders from
prose alone, and every scene composition describes the rider to the image model
in words. Prose that dense is on the order of forty bits of real choice, and a
face is not a forty-bit object, so the second render was reliably a DIFFERENT
person wearing the same hair colour. The fix in the pipeline is to hand the image
model the photograph instead of a paragraph about it — and that fix does nothing
on a re-render if the photograph is gone, which it was: the upload was passed
through the studio and dropped. Identity was destroyed the moment onboarding
finished. This column is the photograph surviving that moment.

NULLABLE, no server default, no backfill. Every existing row has none and none
can be reconstructed — the originals were never kept anywhere. A rider from
before simply keeps re-rendering from prose exactly as they do today, which is
why nothing downstream may treat this as required.

WHAT ACTUALLY GOES IN is not the upload: it is a head crop, ~512 px on the long
edge, WebP q82, well under 60 KB as a `data:image/webp;base64` URL — the same
resize-and-encode shape `services/crew_avatars.thumbnail` uses. Text rather than
bytea for the same reason every other image in this schema is Text (`users.
avatar_url`, `garage_assets.image_url`): it is a data URL, and it is read on a
row that is already serialised into JSON on hot paths.

Adding a nullable Text column takes no table rewrite and no lock worth naming, so
this is safe to apply to a live `garage_assets`.

No RLS change: the table's existing `user_id` policy already covers every column
on it. And the column is deliberately absent from every response schema — it is a
photograph of the rider's face and belongs only to the render path.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "sp4c1e7b9d2a"
down_revision: str | Sequence[str] | None = "hd5e2b7c9f31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "garage_assets",
        sa.Column("source_photo", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    # Dropping this loses the crops for good; there is nowhere else they exist.
    # That is the correct downgrade all the same — a rider whose photo is gone
    # falls back to the prose path, which is precisely where they were before.
    op.drop_column("garage_assets", "source_photo")
