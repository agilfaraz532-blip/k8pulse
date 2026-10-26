"""Self-service sign-up: full name and admin approval on user accounts

Existing accounts are treated as already approved.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("full_name", sa.String(100), nullable=True))
        batch.add_column(sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_approved")
        batch.drop_column("full_name")
