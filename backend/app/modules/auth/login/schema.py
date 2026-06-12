from pydantic import BaseModel

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    message: str
    access_token: str | None = None
    user_id: str | None = None

class LogoutResponse(BaseModel):
    success: bool
    message: str
