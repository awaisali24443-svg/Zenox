from fastapi import APIRouter, Depends
from app.modules.chat.messages.schema import SendMessageRequest, SendMessageResponse
from app.modules.chat.messages.service import send_message
from app.core.auth_middleware import get_current_user

messages_router = APIRouter()

@messages_router.post("/chat/message", response_model=SendMessageResponse)
async def handle_send_message(request: SendMessageRequest, user: dict = Depends(get_current_user)):
    result = await send_message(request.session_id, request.content, request.history)
    return SendMessageResponse(
        success=result["success"],
        content=result.get("content", ""),
        message=result.get("message", "")
    )
