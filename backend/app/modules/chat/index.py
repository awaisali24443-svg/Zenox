from fastapi import APIRouter
from app.modules.chat.messages.router import messages_router
from app.modules.chat.sessions.router import sessions_router

chat_router = APIRouter()
chat_router.include_router(messages_router)
chat_router.include_router(sessions_router)
