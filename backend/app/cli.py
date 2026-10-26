"""
Admin command line.

    python -m app.cli set-password <username>              # prompts for the new password
    python -m app.cli set-password <username> --password X  # non-interactive

With Docker Compose:
    docker compose exec backend python -m app.cli set-password admin
"""
import argparse
import asyncio
import getpass
import sys

from sqlalchemy import func, select

from app.core.security import get_password_hash
from app.models.database import AsyncSessionLocal, User, engine, init_db
from app.schemas.auth import _check_password


async def set_password(username: str, password: str) -> int:
    try:
        return await _set_password(username, password)
    finally:
        # Close pooled connections so the command exits immediately
        await engine.dispose()


async def _set_password(username: str, password: str) -> int:
    await init_db()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where((User.username == username) | (func.lower(User.email) == username.lower()))
        )).scalars().first()
        if not user:
            print(f"No user named '{username}'.", file=sys.stderr)
            return 1
        user.hashed_password = get_password_hash(password)
        await db.commit()
        print(f"Password updated for '{user.username}' ({user.role}).")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="K8sPulse admin commands")
    sub = parser.add_subparsers(dest="command", required=True)
    sp = sub.add_parser("set-password", help="Set a user's password")
    sp.add_argument("username", help="username or email")
    sp.add_argument("--password", help="new password (prompted for if omitted)")
    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass("New password: ")
        if getpass.getpass("Repeat password: ") != password:
            print("Passwords do not match.", file=sys.stderr)
            return 1
    try:
        _check_password(password)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return asyncio.run(set_password(args.username, password))


if __name__ == "__main__":
    sys.exit(main())
