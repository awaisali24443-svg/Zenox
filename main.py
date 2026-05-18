import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
import httpx
import base64
import urllib.parse

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
        "version": "3.0",
        "product": "Zenox"
    }

def verify_api_key(x_api_key: str = Header(None)):
    expected = os.getenv("SYNOD_API_KEY", "local-dev-key")
    if expected:
        expected = expected.replace('\\n', '\n').split('\n')[0].strip()
    # In local dev, local-dev-key is always accepted
    # In production, key must match SYNOD_API_KEY exactly
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

async def web_search(query: str) -> str:
    """Search the web using DuckDuckGo. No API key needed."""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1"
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, headers={"User-Agent": "Zenox/3.0"})
            data = r.json()
        
        results = []
        # Abstract (main answer)
        if data.get("AbstractText"):
            results.append(f"Summary: {data['AbstractText']}")
        # Related topics
        for topic in data.get("RelatedTopics", [])[:3]:
            if isinstance(topic, dict) and topic.get("Text"):
                results.append(f"• {topic['Text']}")
        
        if results:
            return "Web search results:\n" + "\n".join(results)
        return ""
    except Exception as e:
        print(f"[SEARCH] Error: {e}")
        return ""

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
        "concise": "\nSTYLE: Ultra-concise mode. Maximum 3 short paragraphs. No padding.",
        "detailed": "\nSTYLE: Detailed mode. Comprehensive explanations with examples, context, and edge cases.",
        "creative": "\nSTYLE: Creative mode. Think laterally. Use analogies. Surprise the user. Be inventive."
    }
    
    modifier = style_modifiers.get(style, "")
    system_instruction = f"""You are Zenox, a sharp personal AI built by Awais.

IDENTITY:
- You are Zenox. Never say you are Gemini, Google AI, or any other product.
- You were built by Awais as a personal AI assistant.
- You are direct, intelligent, and genuinely useful.

RESPONSE QUALITY RULES:
1. Never start a response with "Certainly!", "Of course!", "Great question!", 
   "Sure!", "Absolutely!" or any hollow filler phrase. Start immediately 
   with useful content.
2. Never add unnecessary disclaimers like "As an AI, I..." or 
   "I should mention that...". Just answer.
3. Be honest when you don't know something. Say "I'm not sure" instead 
   of making things up.
4. Match the length to the question. Short questions get short answers.
   Complex questions get detailed answers.
5. Use concrete examples over abstract explanations when possible.
6. When explaining technical topics, assume the user is intelligent 
   but may not have domain expertise.
7. Format responses clearly:
   - Use bullet points for lists of 3 or more items
   - Use numbered steps for sequences
   - Use code blocks for any code
   - Use bold for key terms on first mention
8. When writing code, always add brief comments explaining what each 
   section does.
9. If asked to write something creative, actually be creative — 
   don't produce generic AI-sounding output.
10. If a question has a simple answer, give it immediately before 
    any explanation.

PERSONA:
- Think of yourself as a knowledgeable friend who happens to be an expert
  in everything — not a corporate assistant.
- You can have opinions. Share them directly while being respectful.
- You are built for one person: Awais. Treat every conversation as personal.

{modifier}"""
    
    memories = data.get("memories", [])
    if memories:
        memory_text = "\n".join(f"- {m}" for m in memories)
        system_instruction = system_instruction + f"\n\nTHINGS AWAIS HAS TOLD YOU TO REMEMBER:\n{memory_text}\nUse this context naturally when relevant."
    
    message_text = data.get("message", "")
    
    SEARCH_TRIGGERS = [
        "today", "current", "latest", "now", "2025", "2026",
        "news", "price", "weather", "who is", "what is happening",
        "recent", "last week", "this week", "right now"
    ]
    
    search_context = ""
    message_lower = message_text.lower()
    needs_search = any(t in message_lower for t in SEARCH_TRIGGERS)
    
    if needs_search:
        search_context = await web_search(message_text)
    
    # Add search context to system instruction if found
    if search_context:
        system_instruction = system_instruction + f"\n\nCURRENT WEB DATA:\n{search_context}\nUse this data in your response if relevant."
    
    contents = []
    for m in data.get("history", []):
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
        
    image_b64 = data.get("image")
    image_type = data.get("image_type", "image/jpeg")
    message_text = data.get("message", "")

    user_parts = []
    if image_b64:
        user_parts.append(
            types.Part.from_bytes(
                data=base64.b64decode(image_b64), 
                mime_type=image_type
            )
        )
    if message_text:
        # Must be types.Part, not raw string, when mixed with image parts
        user_parts.append(types.Part.from_text(text=message_text))
    
    if not user_parts:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
        
    contents.append({
        "role": "user",
        "parts": user_parts
    })
    
    client = genai.Client(api_key=key, http_options={'api_version': 'v1alpha'})
    
    async def stream_generator():
        try:
            async for chunk in client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction
                )
            ):
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

@app.post("/api/suggestions")
async def get_suggestions(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return {"suggestions": []}
    data = await request.json()
    last_response = data.get("last_response", "")[:500]
    original = data.get("original_question", "")[:200]
    client = genai.Client(api_key=key, http_options={'api_version':'v1alpha'})
    try:
        r = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"""Based on this Q&A:
Q: {original}
A: {last_response}

Generate exactly 3 short follow-up questions the user might want to ask next.
Format: Return ONLY 3 questions, one per line, no numbers, no bullets, no punctuation at end.
Keep each question under 8 words."""
        )
        lines = [l.strip() for l in r.text.strip().split('\n') if l.strip()][:3]
        return {"suggestions": lines}
    except:
        return {"suggestions": []}
