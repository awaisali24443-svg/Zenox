from fastapi import APIRouter
from app.modules.auth.index import auth_router
from app.modules.chat.index import chat_router

master_router = APIRouter()
master_router.include_router(auth_router, prefix="")
master_router.include_router(chat_router, prefix="")
