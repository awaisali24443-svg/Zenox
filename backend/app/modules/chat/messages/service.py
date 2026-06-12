from app.global.ai_provider import call_ai
from app.global.database import supabase

async def send_message(
    session_id: str,
    content: str,
    history: list[dict]
) -> dict:
    try:
        messages = history + [{"role": "user", "content": content}]
        system_prompt = "You are Zenox, a helpful AI assistant."
        response = await call_ai(messages=messages, system_prompt=system_prompt)
        return {"success": True, "content": response}
    except Exception as e:
        return {"success": False, "content": "", "message": str(e)}
