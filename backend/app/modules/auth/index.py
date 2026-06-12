from fastapi import APIRouter
from app.modules.auth.register.router import register_router
from app.modules.auth.login.router import login_router

auth_router = APIRouter()
auth_router.include_router(register_router)
auth_router.include_router(login_router)
