from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional
from app.modules.auth.login.schema import LoginRequest, LoginResponse, LogoutResponse
from app.modules.auth.login.service import login_user, logout_user

login_router = APIRouter()

@login_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    result = await login_user(request.email, request.password)
    return LoginResponse(
        success=result["success"],
        message=result["message"],
        access_token=result["access_token"],
        user_id=result["user_id"]
    )

@login_router.post("/auth/logout", response_model=LogoutResponse)
async def logout():
    result = await logout_user()
    return LogoutResponse(
        success=result["success"],
        message=result["message"]
    )

from app.core.auth_middleware import get_current_user

@login_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"success": True, "user": user}
