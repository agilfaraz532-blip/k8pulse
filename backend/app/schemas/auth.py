import datetime
import re
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

ROLES = ("admin", "operator", "viewer")
_USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,29}$")


def _check_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ValueError("Password must contain at least one letter and one number")
    return password


class UserBase(BaseModel):
    username: str
    email: str
    role: str = "operator"


class UserCreate(UserBase):
    """Admin creates an account directly."""
    # Format is validated only for new accounts; stored addresses are returned as-is
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class SignupRequest(BaseModel):
    """Self-service registration from the sign-in page."""
    full_name: str
    username: str
    email: EmailStr
    password: str

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not 2 <= len(v) <= 100:
            raise ValueError("Full name must be 2 to 100 characters")
        return v

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip().lower()
        if not _USERNAME.match(v):
            raise ValueError(
                "Username must be 3 to 30 characters: lowercase letters, numbers, dots, dashes or underscores, "
                "starting with a letter or number"
            )
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return _check_password(v)


class SignupResponse(BaseModel):
    status: str   # "active" or "pending"
    message: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: int
    full_name: Optional[str] = None
    is_active: bool
    is_approved: bool = True
    created_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Admin changes to an account; omitted fields are left unchanged."""
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_approved: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ROLES:
            raise ValueError("Role must be admin, operator or viewer")
        return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
