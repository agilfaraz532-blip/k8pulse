import hmac
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from jose import jwt, JWTError

from app.core.config import settings
from app.core.logging import logger
from app.core.ratelimit import limit_auth_attempts
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.database import get_db, AsyncSessionLocal, User
from typing import List

from app.schemas.auth import (
    ROLES, AdminSignupRequest, SignupRequest, SignupResponse, Token, UserCreate, UserLogin, UserResponse, UserUpdate,
)

router = APIRouter(prefix="/auth", tags=["Authentication & Users"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/token", auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def require_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    """Dependency for protected routes: returns the logged-in user or raises 401."""
    if not settings.AUTH_ENABLED:
        return User(id=0, username=settings.ADMIN_USERNAME, email=settings.ADMIN_EMAIL, role="admin", is_active=True)
    if not token:
        raise _UNAUTHORIZED
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        raise _UNAUTHORIZED
    if not username:
        raise _UNAUTHORIZED

    user = (await db.execute(select(User).where(User.username == username))).scalars().first()
    if not user or not user.is_active:
        raise _UNAUTHORIZED
    return user


async def require_admin(user: User = Depends(require_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


async def require_operator(user: User = Depends(require_user)) -> User:
    """Changes to alert rules/events: operators and admins; viewers are read-only."""
    if user.role not in ("admin", "operator"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your role (viewer) is read-only")
    return user


async def ensure_admin_user() -> None:
    """Create the bootstrap admin account from ADMIN_USERNAME / ADMIN_PASSWORD if it is missing."""
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User).where(User.username == settings.ADMIN_USERNAME))).scalars().first()
        if existing:
            return
        db.add(User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        ))
        await db.commit()
        logger.info(f"Created bootstrap admin user '{settings.ADMIN_USERNAME}'")
        if settings.ADMIN_PASSWORD == "admin":
            logger.warning("Admin password is the default 'admin' - set ADMIN_PASSWORD before exposing K8sPulse.")


async def _authenticate(username: str, password: str, db: AsyncSession, portal: str = None) -> Token:
    # Users may sign in with their username or their email address
    identifier = username.strip()
    user = (await db.execute(
        select(User).where((User.username == identifier.lower()) | (User.username == identifier)
                           | (func.lower(User.email) == identifier.lower()))
    )).scalars().first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    # Only explain the account state once the password is proven, so it cannot be probed
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Your account is waiting for an administrator to approve it.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This account has been disabled. Contact your administrator.")
    # Separate sign-in pages: each only admits its own kind of account
    if portal == "admin" and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This is not an administrator account. Please use the user sign-in page.")
    if portal == "user" and user.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This is an administrator account. Please use the administrator sign-in page.")

    token = create_access_token(
        subject=user.username,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        role=user.role,
    )
    return Token(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=Token, dependencies=[Depends(limit_auth_attempts)])
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """JSON login used by the dashboard."""
    portal = credentials.portal if credentials.portal in ("admin", "user") else None
    return await _authenticate(credentials.username, credentials.password, db, portal)


@router.post("/token", response_model=Token, dependencies=[Depends(limit_auth_attempts)])
async def login_form(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """OAuth2 password flow (used by the Swagger UI 'Authorize' button)."""
    return await _authenticate(form.username, form.password, db)


@router.get("/config")
async def auth_config():
    """Tells the frontend whether it needs to show the login screen."""
    return {
        "auth_enabled": settings.AUTH_ENABLED,
        "signup_mode": _signup_mode(),
        "admin_signup_enabled": bool(settings.ADMIN_REGISTRATION_KEY),
    }


def _signup_mode() -> str:
    mode = settings.SIGNUP_MODE.lower()
    return mode if mode in ("approval", "open", "disabled") else "approval"


async def _ensure_unique(db: AsyncSession, username: str, email: str) -> None:
    if (await db.execute(select(User).where(User.username == username))).scalars().first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That username is already taken")
    if (await db.execute(select(User).where(func.lower(User.email) == email.lower()))).scalars().first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with that email already exists")


@router.post("/admin/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_auth_attempts)])
async def admin_signup(data: AdminSignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Administrator registration. Requires ADMIN_REGISTRATION_KEY, so only someone with access to the
    server configuration can create administrators. The account is active immediately.
    """
    expected = settings.ADMIN_REGISTRATION_KEY
    if not expected or not settings.AUTH_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Administrator registration is disabled on this server.")
    if not hmac.compare_digest(data.registration_key.strip().encode(), expected.encode()):
        logger.warning(f"Rejected administrator registration for '{data.username}': wrong registration key")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The administrator registration key is incorrect.")
    await _ensure_unique(db, data.username, data.email)

    db.add(User(
        username=data.username,
        email=data.email.lower(),
        full_name=data.full_name,
        hashed_password=get_password_hash(data.password),
        role="admin",
        is_active=True,
        is_approved=True,
    ))
    await db.commit()
    logger.info(f"New administrator registered: '{data.username}'")
    return SignupResponse(status="active", message="Administrator account created. You can sign in now.")


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_auth_attempts)])
async def signup(data: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Self-service registration. Depending on SIGNUP_MODE the account is active at once or waits for approval."""
    mode = _signup_mode()
    if mode == "disabled" or not settings.AUTH_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Sign-up is disabled. Ask an administrator to create an account for you.")
    await _ensure_unique(db, data.username, data.email)

    approved = mode == "open"
    role = settings.SIGNUP_DEFAULT_ROLE if settings.SIGNUP_DEFAULT_ROLE in ROLES else "viewer"
    db.add(User(
        username=data.username,
        email=data.email.lower(),
        full_name=data.full_name,
        hashed_password=get_password_hash(data.password),
        role="viewer" if role == "admin" else role,   # never hand out admin through sign-up
        is_active=True,
        is_approved=approved,
    ))
    await db.commit()
    logger.info(f"New sign-up '{data.username}' ({'active' if approved else 'pending approval'})")
    if approved:
        return SignupResponse(status="active", message="Account created. You can sign in now.")
    return SignupResponse(status="pending",
                          message="Account created. An administrator needs to approve it before you can sign in.")


@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: User = Depends(require_user)):
    return current_user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_in: UserCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Create a user account (admin only)."""
    if (await db.execute(select(User).where(User.username == user_in.username))).scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if user_in.role not in ("admin", "operator", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be admin, operator or viewer")

    user = User(
        username=user_in.username,
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True,
        is_approved=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """All accounts, pending approvals first (admin only)."""
    users = (await db.execute(select(User))).scalars().all()
    return sorted(users, key=lambda u: (u.is_approved, u.username))


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, changes: UserUpdate, db: AsyncSession = Depends(get_db),
                      admin: User = Depends(require_admin)):
    """Approve, change role, or enable/disable an account (admin only)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and (changes.is_active is False or (changes.role and changes.role != "admin")):
        raise HTTPException(status_code=400, detail="You cannot disable or demote your own account")

    losing_admin = user.role == "admin" and (changes.is_active is False or (changes.role and changes.role != "admin"))
    if losing_admin:
        admins = (await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True),
                                                         User.is_approved.is_(True))
        )).scalar_one()
        if admins <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin must remain")

    for field in ("role", "is_active", "is_approved"):
        value = getattr(changes, field)
        if value is not None:
            setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    logger.info(f"Admin '{admin.username}' updated user '{user.username}': {changes.model_dump(exclude_none=True)}")
    return user
