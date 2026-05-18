import os
import asyncio
from contextlib import asynccontextmanager
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(ping_services())
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {
        "status": "ok", 
        "model": "gemini-2.5-flash",
        "version": "2.0",
        "product": "Zenox"
    }

def verify_api_key(x_api_key: str = Header(None)):
    expected = os.getenv("SYNOD_API_KEY", os.getenv("VITE_SYNOD_API_KEY", "local-dev-key"))
    if expected:
        expected = expected.replace('\\n', '\n').split('\n')[0].strip()
    
    if x_api_key != expected and expected != "local-dev-key":
        if x_api_key != "local-dev-key" and x_api_key != os.getenv("VITE_SYNOD_API_KEY"):
             raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/api/chat")
async def chat(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY")
    if key:
        key = key.replace('\\n', '\n').split('\n')[0].strip()
    if not key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")
    data = await request.json()
    
    style = data.get("response_style", "balanced")
    
    style_modifiers = {
        "balanced": "",
        "concise": " Keep all responses concise and to the point — maximum 3 paragraphs.",
        "detailed": " Give comprehensive, detailed explanations with examples.",
        "creative": " Be creative, use analogies, think outside the box."
    }
    
    modifier = style_modifiers.get(style, "")
    system_instruction = f"You are Zenox, a sharp and intelligent personal AI built by Awais. You are helpful, direct, and precise. Never say you are built by Google or Anthropic. You are Zenox. You belong to Awais.{modifier}"
    
    contents = []
    for m in data.get("history", []):
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    
    contents.append({"role": "user", "parts": [{"text": data.get("message", "")}]})
    
    client = genai.Client(api_key=key, http_options={'api_version': 'v1alpha'})
    
    async def stream_generator():
        try:
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

@app.post("/api/title")
async def generate_title(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY")
    if key:
        key = key.replace('\\n', '\n').split('\n')[0].strip()
    if not key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")
    
    data = await request.json()
    message = data.get("message", "")
    
    client = genai.Client(api_key=key, http_options={'api_version': 'v1alpha'})
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"In 4-6 words, create a title for a conversation starting with:\n'{message}'\nReturn ONLY the title. No quotes. No punctuation."
        )
        return {"title": response.text.strip()}
    except Exception as e:
        return {"title": message[:40] + ("..." if len(message) > 40 else "")}
