from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.modules.chat.sessions.schema import CreateSessionRequest, SessionResponse
from app.modules.chat.sessions.service import create_session, get_sessions
from app.global.auth_middleware import get_current_user

sessions_router = APIRouter()

@sessions_router.post("/chat/sessions", response_model=SessionResponse)
async def handle_create_session(request: CreateSessionRequest, user: dict = Depends(get_current_user)):
    result = await create_session(user.get("id"), request.title)
    if result["success"]:
        return SessionResponse(**result["data"])
    raise HTTPException(status_code=400, detail=result.get("message", "Failed to create session"))

@sessions_router.get("/chat/sessions", response_model=List[SessionResponse])
async def handle_get_sessions(user: dict = Depends(get_current_user)):
    sessions = await get_sessions(user.get("id"))
    return [SessionResponse(**s) for s in sessions]
