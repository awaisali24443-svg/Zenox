import os
import asyncio
from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
import httpx

# PERMANENT PING SYSTEM — DO NOT REMOVE OR MODIFY
async def ping_services():
    urls = []
    if os.getenv("FRONTEND_URL"): 
        urls.append(("Frontend", os.getenv("FRONTEND_URL")))
    if os.getenv("BACKEND_URL"):  
        urls.append(("Backend", os.getenv("BACKEND_URL")))
    if not urls:
        print("[PING] Add FRONTEND_URL and BACKEND_URL to activate")
        return
    print(f"[PING] Active — pinging {len(urls)} services every 10min")
    while True:
        await asyncio.sleep(600)
        for name, url in urls:
            try:
                async with httpx.AsyncClient(timeout=15.0) as c:
                    r = await c.get(url)
                    print(f"[PING] ✅ {name}: {r.status_code}")
            except Exception as e:
                print(f"[PING] ❌ {name}: {e}")
# END PERMANENT PING SYSTEM

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(ping_services())

@app.get("/api/health")
def health():
    return {"status": "ok", "agent": "gemini", "version": "1.0"}

def verify_api_key(x_api_key: str = Header(None)):
    expected = os.getenv("SYNOD_API_KEY", "local-dev-key")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/api/chat")
async def chat(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY")
    if key:
        key = key.strip().split('\n')[0].strip()
    if not key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")
    data = await request.json()
    
    # Format messages for Gemini API
    # The system instruction is handled separately
    system_instruction = "You are Awais Codex, a helpful and intelligent personal AI assistant. Be clear, specific, and genuinely useful."
    
    contents = []
    for m in data.get("history", []):
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    
    contents.append({"role": "user", "parts": [{"text": data.get("message", "")}]})
    
    client = genai.Client(api_key=key, http_options={'api_version': 'v1alpha'})
    # Use v1alpha for stream if it's more stable, or just default which is v1alpha
    
    async def stream_generator():
        try:
            # We must use async generator if we have async client, but standard GenAI SDK provides async client
            # Let's wrap standard sync iter in async gen if we can't do async, but genai supports async via client.aio
            response_iter = client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction
                )
            )
            async for chunk in response_iter:
                if chunk.text is not None:
                    yield chunk.text
        except Exception as e:
            yield str(e)

    return StreamingResponse(stream_generator(), media_type="text/plain")
