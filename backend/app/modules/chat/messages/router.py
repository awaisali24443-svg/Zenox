from fastapi import APIRouter, Depends
from app.modules.chat.messages.schema import SendMessageRequest, SendMessageResponse
from app.modules.chat.messages.service import send_message
from app.core.auth_middleware import get_current_user

messages_router = APIRouter()

@messages_router.post("/chat/message")
async def handle_send_message(
    request: SendMessageRequest,
    user: dict = Depends(get_current_user)
):
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = await send_message(
        request.session_id,
        request.content,
        request.history,
        user.get("id") if user else None
    )
    return {
        "success": result["success"],
        "content": result.get("content", ""),
        "message": result.get("message", "")
    }
