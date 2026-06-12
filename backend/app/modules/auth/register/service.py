from app.global.database import supabase

async def register_user(email: str, password: str) -> dict:
    try:
        res = supabase.auth.sign_up({"email": email, "password": password})
        if res.user:
            return {"success": True, "message": "Signup successful", "user_id": res.user.id}
        else:
            return {"success": False, "message": "Signup failed, no user returned", "user_id": None}
    except Exception as e:
        return {"success": False, "message": str(e), "user_id": None}
