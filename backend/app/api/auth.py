from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, verify_password
from app.models.portal_ops import LoginHistory
from app.models.user import User
from app.schemas import LoginRequest, Token, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


async def _record_login(
    db: AsyncSession,
    user_id: int,
    success: bool,
    request: Request | None,
    mfa_used: bool = False,
) -> None:
    db.add(
        LoginHistory(
            user_id=user_id,
            success=success,
            ip_address=request.client.host if request and request.client else None,
            user_agent=(request.headers.get("user-agent")[:250] if request and request.headers.get("user-agent") else None),
            mfa_used=mfa_used,
        )
    )


@router.post("/login", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        if user:
            await _record_login(db, user.id, False, request)
            await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")
    if user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA enabled — use /auth/login/json with mfa_pin",
        )
    token = create_access_token(str(user.id), user.role.value)
    await _record_login(db, user.id, True, request, False)
    await db.commit()
    return Token(
        access_token=token,
        role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/login/json", response_model=Token)
async def login_json(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        if user:
            await _record_login(db, user.id, False, request)
            await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")
    mfa_used = False
    if user.mfa_enabled:
        if not body.mfa_pin or not user.mfa_pin_hash or not verify_password(body.mfa_pin, user.mfa_pin_hash):
            await _record_login(db, user.id, False, request)
            await db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA PIN required or invalid")
        mfa_used = True
    token = create_access_token(str(user.id), user.role.value)
    await _record_login(db, user.id, True, request, mfa_used)
    await db.commit()
    return Token(
        access_token=token,
        role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return user
