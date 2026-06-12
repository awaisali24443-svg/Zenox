from pydantic import BaseModel

class CreateSessionRequest(BaseModel):
    title: str = "New Chat"

class SessionResponse(BaseModel):
    id: str
    title: str
    created_at: str
