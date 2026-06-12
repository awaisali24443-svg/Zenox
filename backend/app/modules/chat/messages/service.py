import asyncio
import traceback
from app.core.ai_provider import call_ai
from app.core.database import supabase

async def send_message(
    session_id: str,
    content: str,
    history: list[dict],
    user_id: str
) -> dict:
    try:
        messages = history + [{"role": "user", "content": content}]
        system_prompt = "You are Zenox, a helpful AI assistant."
        response = await call_ai(messages=messages, system_prompt=system_prompt)

        def insert_messages():
            return supabase.table("messages").insert([
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "role": "user",
                    "content": content
                },
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "role": "assistant",
                    "content": response
                }
            ]).execute()
            
        await asyncio.to_thread(insert_messages)

        return {"success": True, "content": response}
    except Exception as e:
        return {"success": False, "content": "", "message": str(e) + "\n" + traceback.format_exc()}
