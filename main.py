import os
import asyncio
from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from groq import AsyncGroq
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
    return {"status": "ok", "agent": "groq", "version": "1.0"}

def verify_api_key(x_api_key: str = Header(None)):
    expected = os.getenv("SYNOD_API_KEY", "local-dev-key")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/api/chat")
async def chat(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not set")
    data = await request.json()
    messages = [{"role": "system", "content": "You are Zenox, a helpful and intelligent personal AI assistant. Be clear, specific, and genuinely useful."}]
    for m in data.get("history", []):
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": data.get("message", "")})
    
    client = AsyncGroq(api_key=key)
    
    async def stream_generator():
        try:
            stream = await client.chat.completions.create(
                model="llama3-8b-8192",
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield str(e)

    return StreamingResponse(stream_generator(), media_type="text/plain")
