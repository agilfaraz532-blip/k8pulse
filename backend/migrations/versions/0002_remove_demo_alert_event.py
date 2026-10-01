"""Remove the simulated demo alert event seeded by earlier versions

Earlier releases inserted a fake 'auth-service' CrashLoopBackOff alert whenever the alert
list was empty. Alerts are now produced only by the alert engine from live cluster data.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-01
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM alert_events WHERE target_resource = 'pod:default/auth-service-589cf-4kk2p'")


def downgrade() -> None:
    pass
