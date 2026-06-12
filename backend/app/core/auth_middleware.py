from fastapi import Header, HTTPException
from typing import Optional
from app.modules.auth.login.service import get_current_user_from_token

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Token missing")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = parts[1]
    result = await get_current_user_from_token(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message", "Invalid token"))
    
    return result.get("user")
