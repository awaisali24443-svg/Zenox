from fastapi import APIRouter
from app.modules.auth.register.schema import RegisterRequest, RegisterResponse
from app.modules.auth.register.service import register_user

register_router = APIRouter()

@register_router.post("/auth/register", response_model=RegisterResponse)
async def register(request: RegisterRequest):
    result = await register_user(request.email, request.password)
    return RegisterResponse(
        success=result["success"],
        message=result["message"],
        user_id=result["user_id"]
    )
