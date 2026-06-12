from pydantic import BaseModel

class RegisterRequest(BaseModel):
    email: str
    password: str

class RegisterResponse(BaseModel):
    success: bool
    message: str
    user_id: str | None = None
