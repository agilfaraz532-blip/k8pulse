from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.core.config import settings
from app.core.logging import logger
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.database import get_db, AsyncSessionLocal, User
from app.schemas.auth import UserCreate, UserLogin, UserResponse, Token

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


async def _authenticate(username: str, password: str, db: AsyncSession) -> Token:
    user = (await db.execute(select(User).where(User.username == username))).scalars().first()
    if not user or not user.is_active or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

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


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """JSON login used by the dashboard."""
    return await _authenticate(credentials.username, credentials.password, db)


@router.post("/token", response_model=Token)
async def login_form(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """OAuth2 password flow (used by the Swagger UI 'Authorize' button)."""
    return await _authenticate(form.username, form.password, db)


@router.get("/config")
async def auth_config():
    """Tells the frontend whether it needs to show the login screen."""
    return {"auth_enabled": settings.AUTH_ENABLED}


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
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
