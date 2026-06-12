from app.global.database import supabase

async def login_user(email: str, password: str) -> dict:
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if res.user and res.session:
            return {
                "success": True, 
                "message": "Login successful", 
                "access_token": res.session.access_token, 
                "user_id": res.user.id
            }
        else:
            return {"success": False, "message": "Login failed", "access_token": None, "user_id": None}
    except Exception as e:
        return {"success": False, "message": str(e), "access_token": None, "user_id": None}

async def logout_user() -> dict:
    try:
        supabase.auth.sign_out()
        return {"success": True, "message": "Logout successful"}
    except Exception as e:
        return {"success": False, "message": str(e)}

async def get_current_user_from_token(token: str) -> dict:
    try:
        res = supabase.auth.get_user(token)
        if res.user:
            return {"success": True, "user": res.user.model_dump()}
        return {"success": False, "message": "User not found"}
    except Exception as e:
        return {"success": False, "message": str(e)}
