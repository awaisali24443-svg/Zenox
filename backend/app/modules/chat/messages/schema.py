from pydantic import BaseModel

class SendMessageRequest(BaseModel):
    session_id: str
    content: str
    history: list[dict] = []

class SendMessageResponse(BaseModel):
    success: bool
    content: str
    message: str = ""
