from app.core.database import supabase

async def create_session(user_id: str, title: str) -> dict:
    try:
        res = supabase.table("sessions").insert({"user_id": user_id, "title": title}).execute()
        if res.data:
            return {"success": True, "data": res.data[0]}
        return {"success": False, "message": "Failed to create session"}
    except Exception as e:
        return {"success": False, "message": str(e)}

async def get_sessions(user_id: str) -> list:
    try:
        res = supabase.table("sessions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return res.data if res.data else []
    except Exception as e:
        return []
