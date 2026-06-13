import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.modules.registry import master_router

app = FastAPI()

allowed_origins = os.getenv("FRONTEND_URL", "").split(",")
allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
if not allowed_origins:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=len(allowed_origins) > 0 
                      and allowed_origins != ["*"],
)

app.include_router(master_router)

@app.get("/")
def health():
    return {"status": "alive"}

@app.get("/test-ai")
async def test_ai():
    try:
        from app.core.ai_provider import call_ai
        from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
        response = await call_ai(
            messages=[{"role": "user", "content": "Say hello in one word"}],
            system_prompt="You are a test assistant",
            max_tokens=50
        )
        return {
            "success": True,
            "response": response,
            "gemini_key_exists": bool(GEMINI_API_KEY),
            "groq_key_exists": bool(GROQ_API_KEY)
        }
    except Exception as e:
        from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
        return {
            "success": False,
            "error": str(e),
            "gemini_key_exists": bool(GEMINI_API_KEY),
            "groq_key_exists": bool(GROQ_API_KEY)
        }
