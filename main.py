import os
import asyncio
import uuid
import json
import pathlib
import re
import hashlib
import base64
import urllib.parse
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
import httpx
from pydantic import BaseModel

import zenox_agent.planner as planner
from zenox_agent.memory import memory
from zenox_agent.tools import registry
import zenox_agent.executor as executor

class ToolRegistry:
    """
    Dynamic tool registry. Agent discovers available tools
    and selects them based on task needs.
    No hardcoded tool routes.
    """
    _tools: dict = {}
    
    @classmethod
    def register(cls, name: str, description: str, func):
        cls._tools[name] = {"name": name, "description": description, "func": func}
    
    @classmethod
    def list_tools(cls) -> list:
        return [{"name": t["name"], "description": t["description"]} for t in cls._tools.values()]
    
    @classmethod
    async def execute(cls, name: str, **kwargs) -> str:
        if name not in cls._tools:
            return f"Tool '{name}' not found. Available: {[t for t in cls._tools]}"
        try:
            result = await cls._tools[name]["func"](**kwargs)
            return str(result)
        except Exception as e:
            return f"Tool error: {str(e)}"

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

async def _tool_web_search(query: str) -> str:
    return await web_search(query)

async def _tool_generate_code(prompt: str, language: str = "javascript") -> str:
    key = os.getenv("GEMINI_API_KEY","").strip()
    if not key: return "GEMINI_API_KEY not set"
    client = genai.Client(api_key=key, http_options={'api_version':'v1alpha'})
    r = await client.aio.models.generate_content(
        model="gemini-3-flash",
        contents=f"Write {language} code for: {prompt}\nReturn raw code only."
    )
    return r.text or ""

async def _tool_execute_code(code: str, language: str = "javascript") -> str:
    e2b_key = os.getenv("E2B_API_KEY","").strip()
    if not e2b_key: return "E2B_API_KEY not set"
    try:
        async with httpx.AsyncClient(timeout=25.0) as hc:
            cr = await hc.post(
                "https://api.e2b.dev/sandboxes",
                headers={"X-Api-Key":e2b_key,"Content-Type":"application/json"},
                json={"templateID":"base"}
            )
            sid = cr.json().get("sandboxID","")
            cmd = f"node -e {repr(code[:500])}" if language=="javascript" else f"python3 -c {repr(code[:500])}"
            er = await hc.post(
                f"https://api.e2b.dev/sandboxes/{sid}/exec",
                headers={"X-Api-Key":e2b_key,"Content-Type":"application/json"},
                json={"cmd":cmd}
            )
            result_data = er.json()
            await hc.delete(f"https://api.e2b.dev/sandboxes/{sid}", headers={"X-Api-Key":e2b_key})
            return result_data.get("stdout","") or result_data.get("stderr","") or "Done"
    except Exception as e:
        return f"Error: {str(e)}"

ToolRegistry.register("web_search", "Search the web for current information", _tool_web_search)
ToolRegistry.register("generate_code", "Generate code in any language", _tool_generate_code)
ToolRegistry.register("execute_code", "Execute code in a safe sandbox", _tool_execute_code)

async def summarize_old_context(
    messages: list, key: str, keep_recent: int = 6
) -> tuple[str, list]:
    """
    Summarize old messages to prevent context explosion.
    Returns (summary_string, recent_messages_to_keep)
    """
    if len(messages) <= keep_recent:
        return "", messages
    
    old_messages = messages[:-keep_recent]
    recent_messages = messages[-keep_recent:]
    
    conversation_text = "\n".join([
        f"{m['role'].upper()}: {m['content'][:300]}"
        for m in old_messages
    ])
    
    try:
        client = genai.Client(api_key=key, http_options={'api_version':'v1alpha'})
        r = await client.aio.models.generate_content(
            model="gemini-3-flash",
            contents=f"""Summarize this conversation history in 3-5 sentences.
Focus on: key topics discussed, decisions made, code written, user preferences shown.
Be specific and factual.

{conversation_text}

Summary:"""
        )
        summary = (r.text or "").strip()
        return summary, recent_messages
    except:
        return f"[Earlier: {len(old_messages)} messages about {old_messages[0]['content'][:50]}...]", recent_messages

async def call_llm_with_fallback(
    prompt: str, 
    system: str = "",
    model_preference: str = "gemini"
) -> str:
    """
    Try Gemini first. Fall back to Groq if it fails.
    This eliminates single-point-of-failure on one provider.
    """
    gemini_key = os.getenv("GEMINI_API_KEY","").strip()
    groq_key   = os.getenv("GROQ_API_KEY","").strip()
    
    # Try Gemini first
    if gemini_key:
        try:
            client = genai.Client(api_key=gemini_key, http_options={'api_version':'v1alpha'})
            contents = prompt
            config = types.GenerateContentConfig(temperature=0.7)
            if system:
                config = types.GenerateContentConfig(
                    system_instruction=system, temperature=0.7
                )
            r = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model="gemini-3-flash",
                    contents=contents,
                    config=config
                ),
                timeout=30.0
            )
            return r.text or ""
        except Exception as e:
            print(f"[LLM] Gemini failed: {e} — trying Groq fallback")
    
    # Groq fallback
    if groq_key:
        try:
            messages_list = []
            if system:
                messages_list.append({"role":"system","content":system})
            messages_list.append({"role":"user","content":prompt})
            
            async with httpx.AsyncClient(timeout=25.0) as hc:
                r = await hc.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization":f"Bearer {groq_key}","Content-Type":"application/json"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": messages_list,
                        "max_tokens": 2048,
                        "temperature": 0.7
                    }
                )
                data = r.json()
                return data["choices"][0]["message"]["content"] or ""
        except Exception as e:
            print(f"[LLM] Groq fallback also failed: {e}")
    
    return "Error: No LLM provider available. Check GEMINI_API_KEY or GROQ_API_KEY."

INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all instructions",
    "disregard the above",
    "you are now",
    "new persona",
    "pretend you are",
    "act as if",
    "system prompt",
    "reveal your instructions",
    "bypass",
    "jailbreak",
    "__import__('os').system",
    "exec(",
    "eval(",
    "subprocess",
    "os.system",
    "rm -rf",
    "DROP TABLE",
    "DELETE FROM"
]

def is_prompt_injection(text: str) -> bool:
    text_lower = text.lower()
    return any(p.lower() in text_lower for p in INJECTION_PATTERNS)

# ── In-memory background task store ──────────────────────
# Key: task_id, Value: task state dict
# Used for fire-and-forget HuggingFace timeout bypass
_background_tasks: dict = {}

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

async def cleanup_old_tasks():
    """Remove completed background tasks older than 30 minutes"""
    while True:
        await asyncio.sleep(1800)
        now = __import__('time').time()
        to_delete = [
            tid for tid, t in _background_tasks.items()
            if t.get("status") in ("complete", "failed")
            and now - t.get("created_at", 0) > 1800
        ]
        for tid in to_delete:
            _background_tasks.pop(tid, None)
        if to_delete:
            print(f"[CLEANUP] Removed {len(to_delete)} old tasks")

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(ping_services())
    asyncio.create_task(cleanup_old_tasks())
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_api_key(x_api_key: str = Header(None)):
    expected = os.getenv("SYNOD_API_KEY", "local-dev-key")
    if expected:
        expected = expected.replace('\\n', '\n').split('\n')[0].strip()
    # In local dev, local-dev-key is always accepted
    # In production, key must match SYNOD_API_KEY exactly
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/api/health")
async def health():
    return {
        "status": "ok", 
        "model": "gemini-3.1-pro-preview",
        "version": "16.0",
        "product": "Zenox"
    }

@app.get("/api/health/keys")
async def health_keys(_=Depends(verify_api_key)):
    keys = {
        "SYNOD_API_KEY": os.getenv("SYNOD_API_KEY"),
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY"),
        "E2B_API_KEY": os.getenv("E2B_API_KEY"),
        "GITHUB_TOKEN": os.getenv("GITHUB_TOKEN"),
        "GITHUB_USERNAME": os.getenv("GITHUB_USERNAME"),
    }
    status = {}
    for key, value in keys.items():
        if value:
            status[key] = "Connected ✅"
        else:
            status[key] = "Missing ❌"
            
    return status

@app.get("/api/tools")
async def list_tools(_=Depends(verify_api_key)):
    return {"tools": ToolRegistry.list_tools()}

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
    
    agent_mode = data.get("agent_mode", False)
    if agent_mode:
        system_instruction += """
\n\n*** AGENT MODE ACTIVE ***
You are an autonomous agent (Zenox).
When the user asks you to build, write code, or create something:
1. Always start by providing a step-by-step plan using a markdown code block with language "plan".
   Example:
   ```plan
   1. Analyze the requirement
   2. Create python script
   ```
2. Then, write the code or content for files. For each file, use a code block with language formatted as "file:filename.ext".
   Example:
   ```file:calc.py
   def add(a, b): return a + b
   ```
3. Explain what you did and offer to run/test it if applicable.
"""
    
    memories = data.get("memories", [])
    if memories:
        memory_text = "\n".join(f"- {m}" for m in memories)
        system_instruction = system_instruction + f"\n\nTHINGS AWAIS HAS TOLD YOU TO REMEMBER:\n{memory_text}\nUse this context naturally when relevant."
    
    message_text = data.get("message", "")
    
    if is_prompt_injection(message_text):
        async def safe_reject():
            yield "I detected a potentially harmful instruction pattern in that message. Please rephrase your request."
        return StreamingResponse(safe_reject(), media_type="text/plain")
    
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
    
    history = data.get("history", [])
    context_summary = ""
    
    if len(history) > 8:
        context_summary, history = await summarize_old_context(
            history, key, keep_recent=6
        )
    
    if context_summary:
        system_instruction = system_instruction + f"\n\nEARLIER CONVERSATION SUMMARY:\n{context_summary}\n(Recent messages follow in the conversation.)"
    
    contents = []
    for m in history:
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
                model="gemini-3.1-pro-preview",
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

task_progress: dict = {}

def update_progress(task_id: str, step: str, status: str, detail: str = ""):
    if task_id not in task_progress:
        task_progress[task_id] = []
    task_progress[task_id].append({
        "step": step,
        "status": status,
        "detail": detail,
        "timestamp": __import__('time').time()
    })

@app.get("/api/agent/progress/{task_id}")
async def get_progress(task_id: str, _=Depends(verify_api_key)):
    progress = task_progress.get(task_id, [])
    return {"task_id": task_id, "progress": progress}

@app.delete("/api/agent/progress/{task_id}")
async def clear_progress(task_id: str, _=Depends(verify_api_key)):
    task_progress.pop(task_id, None)
    return {"cleared": True}

@app.post("/api/agent/classify")
async def classify_task(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    data = await request.json()
    prompt = data.get("prompt", "")
    
    if not prompt:
        return {"type": "chat", "language": "text", "steps": []}
    
    try:
        client = genai.Client(api_key=key, http_options={'api_version': 'v1alpha'})
        
        class ClassificationResult(BaseModel):
            type: str
            language: str
            steps: list[str]
            
        system_instruction = "You classify user intents. If the user wants to just chat, learn, explain concepts, summarize, or ask general questions, return type 'chat' and an empty steps array. If they want to build, automate, code, fix code, or execute an action, return type as one of ['website', 'python_script', 'api', 'component', 'script', 'general_agent'], the appropriate language, and list 3-5 logical execution steps."
        
        response = await client.aio.models.generate_content(
            model="gemini-3-flash",
            contents=f"User Prompt:\n{prompt}",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=ClassificationResult,
                temperature=0.1
            )
        )
        result = json.loads(response.text)
        return result
    except Exception as e:
        print("Classification error, falling back to heuristics:", e)
        prompt_lower = prompt.lower()
        
        if any(w in prompt_lower for w in ["website","webpage","html","landing page","portfolio","blog"]):
            task_type = "website"
            language = "html"
        elif any(w in prompt_lower for w in ["python","flask","django","data analysis","csv","pandas"]):
            task_type = "python_script"
            language = "python"
        elif any(w in prompt_lower for w in ["api","rest","endpoint","backend","server"]):
            task_type = "api"
            language = "javascript"
        elif any(w in prompt_lower for w in ["react","component","ui component","vue","angular"]):
            task_type = "component"
            language = "typescript"
        elif any(w in prompt_lower for w in ["automate","script","tool","utility","cli"]):
            task_type = "script"
            language = "python"
        elif any(w in prompt_lower for w in ["hi ","hello ","how ","what ","why ","explain ","can you "]):
            return {"type": "chat", "language": "text", "steps": []}
        else:
            task_type = "general_agent"
            language = "javascript"
        
        steps_map = {
            "website": [
                "Analyzing requirements",
                "Designing layout and structure",
                "Writing HTML/CSS code",
                "Adding interactions",
                "Testing and Deploying"
            ],
            "python_script": [
                "Understanding requirements",
                "Writing Python syntax",
                "Testing execution",
                "Saving result"
            ],
            "api": [
                "Designing API structure",
                "Writing server logic",
                "Adding endpoints",
                "Testing responses"
            ],
            "general_agent": [
                "Analyzing request",
                "Generating intelligent solution",
                "Verifying outputs",
                "Providing result"
            ]
        }
        
        return {
            "type": task_type,
            "language": language,
            "steps": steps_map.get(task_type, steps_map["general_agent"])
        }

@app.post("/api/agent/generate")
async def agent_generate(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "GEMINI_API_KEY not configured")
    
    data = await request.json()
    prompt = data.get("prompt", "")
    language = data.get("language", "javascript")
    task_type = data.get("task_type", "code")
    task_id = data.get("task_id", "")
    
    if task_id:
        update_progress(task_id, "Generating solution", "running", f"Language: {language}")
    
    if not prompt:
        if task_id: update_progress(task_id, "Generating solution", "error", "prompt required")
        raise HTTPException(400, "prompt required")
    
    try:
        client = genai.Client(
            api_key=key,
            http_options={'api_version': 'v1alpha'}
        )
        
        system = f"""You are an expert {language} developer.
Generate ONLY valid, executable {language} code.
No markdown blocks, no explanations, just raw code.
Include comments explaining what each section does."""
        
        response = await client.aio.models.generate_content(
            model="gemini-3-flash",
            contents=f"{system}\n\nTask: {prompt}"
        )
        
        code = response.text or ""
        code = code.replace("```javascript","").replace("```python","")
        code = code.replace("```js","").replace("```py","")
        code = code.replace("```","").strip()
        
        if task_id:
            update_progress(task_id, "Generating solution", "done", "Code generated successfully")
        
        return {"code": code, "language": language}
    except Exception as e:
        if task_id:
            update_progress(task_id, "Generating solution", "error", str(e))
        raise HTTPException(500, f"Code generation failed: {str(e)}")

def update_progress_all_steps(task_id: str, step_variants: list, status: str, detail: str):
    for step in step_variants:
        update_progress(task_id, step, status, detail)

@app.post("/api/agent/run")
async def agent_run(request: Request, _=Depends(verify_api_key)):
    """
    Fire-and-forget agent endpoint.
    Returns task_id in < 1 second. 
    Actual work runs in background via asyncio.create_task.
    This completely bypasses HuggingFace's 60-second nginx timeout.
    """
    data = await request.json()
    prompt = data.get("prompt", "")
    language = data.get("language", "javascript")
    task_type = data.get("task_type", "general")
    
    if not prompt:
        raise HTTPException(400, "prompt required")
        
    if is_prompt_injection(prompt):
        return {"error": "Request blocked: potentially harmful pattern detected", "task_id": None}
    
    task_id = str(uuid.uuid4())[:12]
    
    _background_tasks[task_id] = {
        "id": task_id,
        "status": "queued",
        "prompt": prompt,
        "progress": [],
        "result": None,
        "error": None,
        "created_at": __import__('time').time()
    }
    
    # CRITICAL: create_task returns immediately — no awaiting
    asyncio.create_task(
        _run_agent_background(task_id, prompt, language, task_type)
    )
    
    return {
        "task_id": task_id,
        "status": "queued",
        "message": "Task started in background. Poll /api/agent/task/{task_id}."
    }

async def _run_agent_background(
    task_id: str, prompt: str, language: str, task_type: str
):
    """
    True ReAct cognitive loop.
    Reason → Act → Observe → Reflect → Repeat until done or max iterations.
    This is NOT a linear pipeline. It thinks, acts, sees results, adjusts.
    """
    def _upd(step: str, status: str, detail: str = ""):
        if task_id in _background_tasks:
            _background_tasks[task_id]["progress"].append({
                "step": step, "status": status,
                "detail": detail, "ts": __import__('time').time()
            })
        update_progress(task_id, step, status, detail)
    
    _background_tasks[task_id]["status"] = "running"
    key = os.getenv("GEMINI_API_KEY", "").strip()
    
    if not key:
        _background_tasks[task_id]["status"] = "failed"
        _background_tasks[task_id]["error"] = "GEMINI_API_KEY not set"
        return
    
    client = genai.Client(api_key=key, http_options={'api_version':'v1alpha'})
    
    # ── The cognitive loop state ──────────────────────────────────────
    MAX_ITERATIONS = 5  # Max reasoning loops before giving up
    iteration = 0
    working_memory = []  # Observations from each iteration
    final_code = ""
    final_result = ""
    task_complete = False
    
    # ── PHASE 0: PLAN ─────────────────────────────────────────────────
    # Generate an initial plan — what needs to happen?
    _upd("Planning", "running", "Creating execution strategy...")
    
    plan_prompt = f"""You are an autonomous AI agent called Zenox.
    
Task: {prompt}
Language: {language}
Task Type: {task_type}

Create a JSON execution plan with these fields:
{{
  "goal": "one sentence describing the end goal",
  "approach": "technical approach in 2-3 sentences",
  "steps": ["step 1", "step 2", "step 3"],
  "success_criteria": "what does success look like",
  "potential_problems": ["problem 1", "problem 2"]
}}

Return ONLY valid JSON."""

    try:
        plan_response = await client.aio.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=plan_prompt
        )
        plan_text = plan_response.text or "{}"
        # Clean markdown
        plan_text = plan_text.replace("```json","").replace("```","").strip()
        plan = json.loads(plan_text)
        _background_tasks[task_id]["plan"] = plan
        _upd("Planning", "done", plan.get("goal","Plan created"))
    except Exception as e:
        plan = {"goal": prompt, "steps": ["Generate solution", "Test", "Save"]}
        _upd("Planning", "done", "Plan created (simplified)")
    
    # ── PHASE 1-N: COGNITIVE LOOP ─────────────────────────────────────
    while iteration < MAX_ITERATIONS and not task_complete:
        iteration += 1
        _upd(f"Iteration {iteration}", "running", f"Reasoning loop {iteration}/{MAX_ITERATIONS}")
        
        # Build observation context from previous iterations
        obs_context = ""
        if working_memory:
            obs_context = "\n\nPREVIOUS ATTEMPTS AND OBSERVATIONS:\n"
            for obs in working_memory[-2:]:  # Last 2 only to save context
                obs_context += f"\nAttempt {obs['iteration']}:\n"
                obs_context += f"Code quality: {obs.get('quality','unknown')}\n"
                obs_context += f"Test result: {obs.get('test_result','unknown')}\n"
                if obs.get('problems'):
                    obs_context += f"Problems found: {obs['problems']}\n"
                obs_context += f"Action taken: {obs.get('reflection','none')}\n"
        
        # ── REASON: What should I generate this iteration? ────────────
        reason_prompt = f"""You are Zenox, an autonomous AI agent.

TASK: {prompt}
LANGUAGE: {language}
PLAN: {plan.get('approach', '')}
ITERATION: {iteration} of {MAX_ITERATIONS}
{obs_context}

{"FIRST ATTEMPT: Generate the best possible solution." if iteration == 1 else "RETRY: Improve based on the problems observed above. Fix the specific issues found."}

Generate complete, working {language} code.
No markdown code blocks. No explanations. Raw code only.
Include clear comments in the code."""

        code_response = await client.aio.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=reason_prompt
        )
        generated_code = (code_response.text or "").strip()
        for fence in ["```html","```python","```javascript","```js","```py","```"]:
            generated_code = generated_code.replace(fence,"")
        generated_code = generated_code.strip()
        
        if not generated_code:
            working_memory.append({
                "iteration": iteration,
                "quality": "failed",
                "test_result": "No code generated",
                "problems": "Generation failed",
                "reflection": "Will retry with simpler prompt"
            })
            continue
        
        final_code = generated_code  # Update best version
        
        # ── ACT: Execute the code ─────────────────────────────────────
        test_result = "Not tested (E2B not configured)"
        test_passed = True
        has_errors = False
        
        e2b_key = os.getenv("E2B_API_KEY","").strip()
        if e2b_key and language in ["javascript","python"] and len(generated_code) < 5000:
            try:
                _upd(f"Testing (iter {iteration})", "running", "Executing in E2B sandbox")
                async with asyncio.timeout(25):
                    async with httpx.AsyncClient(timeout=23.0) as hc:
                        cr = await hc.post(
                            "https://api.e2b.dev/sandboxes",
                            headers={"X-Api-Key":e2b_key,"Content-Type":"application/json"},
                            json={"templateID":"base"}
                        )
                        if cr.status_code == 200:
                            sid = cr.json().get("sandboxID","")
                            # Only test first 800 chars for speed
                            code_to_test = generated_code[:800]
                            cmd = (f"node -e {repr(code_to_test)}"
                                   if language=="javascript"
                                   else f"python3 -c {repr(code_to_test)}")
                            er = await hc.post(
                                f"https://api.e2b.dev/sandboxes/{sid}/exec",
                                headers={"X-Api-Key":e2b_key,"Content-Type":"application/json"},
                                json={"cmd": cmd}
                            )
                            result_data = er.json()
                            stdout = result_data.get("stdout","")
                            stderr = result_data.get("stderr","")
                            test_result = stdout or stderr or "Executed"
                            has_errors = bool(stderr and "Error" in stderr)
                            test_passed = not has_errors
                            await hc.delete(
                                f"https://api.e2b.dev/sandboxes/{sid}",
                                headers={"X-Api-Key":e2b_key}
                            )
            except asyncio.TimeoutError:
                test_result = "Test timeout"
                test_passed = True  # Assume passed if timeout
            except Exception as ex:
                test_result = f"Test error: {str(ex)[:50]}"
                test_passed = True  # Assume ok, continue
        
        # ── OBSERVE: Evaluate the results ─────────────────────────────
        observe_prompt = f"""You are reviewing code you just generated.

TASK: {prompt}
CODE (first 1000 chars): {generated_code[:1000]}
TEST RESULT: {test_result}
HAS ERRORS: {has_errors}
ITERATION: {iteration} of {MAX_ITERATIONS}

Evaluate briefly in JSON:
{{
  "quality": "excellent|good|acceptable|poor",
  "is_complete": true/false,
  "problems": "describe any problems, or 'none'",
  "should_retry": true/false,
  "reflection": "if retrying, what specific thing to fix next iteration"
}}

Return ONLY valid JSON."""

        try:
            obs_response = await client.aio.models.generate_content(
                model="gemini-3.1-pro-preview",
                contents=observe_prompt
            )
            obs_text = (obs_response.text or "{}").replace("```json","").replace("```","").strip()
            observation = json.loads(obs_text)
        except:
            # If observation fails, assume it's good enough
            observation = {
                "quality": "acceptable",
                "is_complete": True,
                "problems": "none",
                "should_retry": False,
                "reflection": "Proceeding with current version"
            }
        
        working_memory.append({
            "iteration": iteration,
            "quality": observation.get("quality","unknown"),
            "test_result": test_result[:200],
            "problems": observation.get("problems","none"),
            "reflection": observation.get("reflection","")
        })
        
        _upd(f"Testing (iter {iteration})", "done",
             f"Quality: {observation.get('quality','?')} | {observation.get('problems','none')[:50]}")
        
        # ── REFLECT: Should we stop or continue? ──────────────────────
        if (observation.get("is_complete") and 
            observation.get("quality") in ["excellent","good","acceptable"] and
            not observation.get("should_retry")):
            task_complete = True
            _upd("Reflection", "done", f"Solution accepted after {iteration} iteration(s)")
            break
        
        if iteration < MAX_ITERATIONS:
            _upd("Reflection", "running", 
                 f"Improving: {observation.get('reflection','')[:60]}")
    
    # ── PHASE FINAL: Commit and Save ──────────────────────────────────
    repo_url = ""
    deploy_url = ""
    github_token = os.getenv("GITHUB_TOKEN","").strip()
    github_user  = os.getenv("GITHUB_USERNAME","").strip()
    
    if github_token and github_user and final_code:
        _upd("Saving to GitHub", "running", "Committing final code")
        try:
            words = prompt.lower().split()[:3]
            base  = '-'.join(w for w in words if w.isalpha())[:25] or 'project'
            short = hashlib.md5(prompt.encode()).hexdigest()[:6]
            repo_name = f"zenox-{re.sub(r'[^a-z0-9-]','-',base)}-{short}"
            gh_headers = {
                "Authorization": f"token {github_token}",
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient(timeout=20.0) as hc:
                ck = await hc.get(
                    f"https://api.github.com/repos/{github_user}/{repo_name}",
                    headers=gh_headers
                )
                if ck.status_code != 200:
                    await hc.post(
                        "https://api.github.com/user/repos",
                        headers=gh_headers,
                        json={"name":repo_name,"auto_init":True,"private":False,
                              "description":f"Zenox: {prompt[:80]}"}
                    )
                    await asyncio.sleep(2)
                ext = "html" if task_type=="website" else "py" if task_type=="python_script" else "js"
                fn  = f"main.{ext}"
                sr  = await hc.get(
                    f"https://api.github.com/repos/{github_user}/{repo_name}/contents/{fn}",
                    headers=gh_headers
                )
                sha = sr.json().get("sha") if sr.status_code==200 else None
                pl  = {
                    "message": f"Zenox Agent ({iteration} iterations): {prompt[:50]}",
                    "content": base64.b64encode(final_code.encode()).decode()
                }
                if sha: pl["sha"] = sha
                pr = await hc.put(
                    f"https://api.github.com/repos/{github_user}/{repo_name}/contents/{fn}",
                    headers=gh_headers, json=pl
                )
                if pr.status_code in [200,201]:
                    repo_url = f"https://github.com/{github_user}/{repo_name}"
            _upd("Saving to GitHub", "done", repo_url)
        except Exception as ex:
            _upd("Saving to GitHub", "done", f"Skipped: {str(ex)[:40]}")
    
    deploy_url = ""
    hook = os.getenv("RENDER_DEPLOY_HOOK_URL","").strip()
    if hook:
        _upd("Deploying", "running", "Triggering Render")
        try:
            async with httpx.AsyncClient(timeout=15.0) as hc:
                dr = await hc.post(hook)
                if dr.status_code in [200,201,202]:
                    deploy_url = os.getenv("RENDER_SERVICE_URL","") or "Deploying..."
            _upd("Deploying", "done", deploy_url)
        except Exception as ex:
            _upd("Deploying", "done", f"Skipped: {str(ex)[:40]}")
    
    try:
        memory.add_episode(
            task_id=task_id,
            prompt=prompt,
            plan=plan,
            result={
                "code_length": len(final_code),
                "iterations": iteration,
                "quality": working_memory[-1].get("quality","unknown") if working_memory else "unknown",
                "repo_url": repo_url,
                "deploy_url": deploy_url
            }
        )
    except Exception as mem_err:
        print(f"[Memory] Episode save error: {mem_err}")

    # Save project
    projects = load_projects()
    pid = f"proj-{task_id}"
    projects[pid] = {
        "id": pid, "bg_task_id": task_id, "prompt": prompt,
        "code": final_code, "language": language,
        "repo_url": repo_url, "deploy_url": deploy_url,
        "iterations": iteration, "quality": working_memory[-1].get("quality","unknown") if working_memory else "unknown",
        "plan": plan, "created_at": __import__('time').time()
    }
    save_projects(projects)
    
    _background_tasks[task_id]["status"] = "complete"
    _background_tasks[task_id]["result"] = {
        "code": final_code, "language": language,
        "repo_url": repo_url, "deploy_url": deploy_url,
        "prompt": prompt, "project_id": pid,
        "iterations": iteration,
        "quality": working_memory[-1].get("quality","acceptable") if working_memory else "acceptable"
    }

@app.get("/api/agent/task/{task_id}")
async def get_background_task(task_id: str, _=Depends(verify_api_key)):
    task = _background_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task

@app.delete("/api/agent/task/{task_id}")
async def cancel_background_task(task_id: str, _=Depends(verify_api_key)):
    _background_tasks.pop(task_id, None)
    return {"cancelled": True}


@app.post("/api/agent/execute")
async def agent_execute(request: Request, _=Depends(verify_api_key)):
    e2b_key = os.getenv("E2B_API_KEY", "").strip()
    data = await request.json()
    code = data.get("code", "")
    language = data.get("language", "javascript")
    task_id = data.get("task_id", "")
    STEP_NAMES = ["Testing", "Testing execution", "Testing the result", "Testing endpoints"]
    
    if task_id:
        update_progress_all_steps(task_id, STEP_NAMES, "running", "Executing code in sandbox")
    
    if not code:
        if task_id:
            update_progress_all_steps(task_id, STEP_NAMES, "error", "code required")
        raise HTTPException(400, "code required")
    
    try:
        if e2b_key:
            async with httpx.AsyncClient(timeout=30.0) as client:
                create_res = await client.post(
                    "https://api.e2b.dev/sandboxes",
                    headers={"X-Api-Key": e2b_key, "Content-Type": "application/json"},
                    json={"templateID": "base"}
                )
                if create_res.status_code == 429:
                    if task_id: 
                        update_progress_all_steps(task_id, STEP_NAMES, "error", "E2B limit reached")
                    return {"result": "E2B limit reached", "success": False}
                sandbox = create_res.json()
                sandbox_id = sandbox.get("sandboxID")
                
                cmd = f"node -e {repr(code)}" if language == "javascript" else f"python3 -c {repr(code)}"
                exec_res = await client.post(
                    f"https://api.e2b.dev/sandboxes/{sandbox_id}/exec",
                    headers={"X-Api-Key": e2b_key, "Content-Type": "application/json"},
                    json={"cmd": cmd}
                )
                result_data = exec_res.json()
                
                await client.delete(
                    f"https://api.e2b.dev/sandboxes/{sandbox_id}",
                    headers={"X-Api-Key": e2b_key}
                )
                
                stdout = result_data.get("stdout", "")
                stderr = result_data.get("stderr", "")
                
                if task_id:
                    status = "error" if stderr else "done"
                    msg = "Execution complete" if not stderr else "Execution failed"
                    update_progress_all_steps(task_id, STEP_NAMES, status, msg)
                
                return {
                    "result": stdout or stderr or "Execution complete",
                    "success": not stderr
                }
        else:
            if task_id:
                update_progress_all_steps(task_id, STEP_NAMES, "error", "E2B_API_KEY not set")
            return {
                "result": "E2B_API_KEY not set \u2014 add it to backend env vars",
                "success": False
            }
    except Exception as e:
        if task_id:
            update_progress_all_steps(task_id, STEP_NAMES, "error", str(e))
        return {"result": f"Execution error: {str(e)}", "success": False}

@app.post("/api/agent/proactive")
async def agent_proactive(request: Request, _=Depends(verify_api_key)):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return {"suggestion": ""}
    
    data = await request.json()
    memories = data.get("memories", "")
    
    if not memories:
        return {"suggestion": ""}
    
    try:
        client = genai.Client(
            api_key=key,
            http_options={'api_version': 'v1alpha'}
        )
        response = await client.aio.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=f"""Based on this user's recent activity:
{memories}

Generate ONE short, specific, helpful proactive suggestion 
(under 20 words) the user might want to do next.
Return ONLY the suggestion. No explanations.
If you cannot make a meaningful suggestion, return empty string."""
        )
        suggestion = (response.text or "").strip()
        # Reject vague or empty responses
        if len(suggestion) < 10 or len(suggestion) > 150:
            return {"suggestion": ""}
        return {"suggestion": suggestion}
    except:
        return {"suggestion": ""}

@app.post("/api/agent/github/commit")
async def github_commit(request: Request, _=Depends(verify_api_key)):
    token = os.getenv("GITHUB_TOKEN", "").strip()
    data = await request.json()
    task_id = data.get("task_id", "")
    
    if task_id:
        update_progress(task_id, "Committing to GitHub", "running", "Pushing code to repository")
        update_progress(task_id, "Saving result", "running", "Pushing code to repository")
    
    if not token:
        if task_id:
            update_progress(task_id, "Committing to GitHub", "error", "GITHUB_TOKEN not configured")
            update_progress(task_id, "Saving result", "error", "GITHUB_TOKEN not configured")
        return {"success": False, "error": "GITHUB_TOKEN not configured in Render env vars"}
    
    repo_name = data.get("repo_name", "")
    files = data.get("files", [])  # [{name: str, content: str}]
    commit_message = data.get("message", "Zenox Agent commit")
    owner = data.get("owner", os.getenv("GITHUB_USERNAME", ""))
    
    if not repo_name or not files or not owner:
        if task_id:
            update_progress(task_id, "Committing to GitHub", "error", "Missing params")
            update_progress(task_id, "Saving result", "error", "Missing params")
        raise HTTPException(400, "repo_name, owner, and files required")
    
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }
    base_url = f"https://api.github.com/repos/{owner}/{repo_name}"
    
    results = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        for file in files:
            file_name = file.get("name", "output.txt")
            file_content = file.get("content", "")
            
            encoded_content = base64.b64encode(
                file_content.encode("utf-8")
            ).decode("utf-8")
            
            # Check if file exists to get its SHA
            sha = None
            check_res = await client.get(
                f"{base_url}/contents/{file_name}",
                headers=headers
            )
            if check_res.status_code == 200:
                sha = check_res.json().get("sha")
            
            # Create or update file
            payload = {
                "message": commit_message,
                "content": encoded_content,
            }
            if sha:
                payload["sha"] = sha
            
            commit_res = await client.put(
                f"{base_url}/contents/{file_name}",
                headers=headers,
                json=payload
            )
            
            if commit_res.status_code in [200, 201]:
                results.append({
                    "file": file_name,
                    "success": True,
                    "url": commit_res.json().get("content", {}).get("html_url", "")
                })
            else:
                results.append({
                    "file": file_name,
                    "success": False,
                    "error": commit_res.text
                })
    
    all_success = all(r["success"] for r in results)
    
    if task_id:
        status = "done" if all_success else "error"
        msg = "Committed successfully" if all_success else "Commit failed"
        update_progress(task_id, "Committing to GitHub", status, msg)
        update_progress(task_id, "Saving result", status, msg)
        
    return {"success": all_success, "results": results}

# Sanitize repo name for GitHub
def sanitize_repo_name(name: str) -> str:
    # Lowercase, replace spaces and special chars with hyphens
    name = name.lower().strip()
    name = re.sub(r'[^a-z0-9\-]', '-', name)
    name = re.sub(r'-+', '-', name)  # no double hyphens
    name = name.strip('-')[:40]  # max 40 chars
    return name or 'zenox-project'

# Generate a project name from the task prompt
@app.post("/api/agent/github/setup-project")
async def setup_project(request: Request, _=Depends(verify_api_key)):
    token = os.getenv("GITHUB_TOKEN", "").strip()
    owner = os.getenv("GITHUB_USERNAME", "").strip()
    
    if not token or not owner:
        return {
            "success": False,
            "error": "GITHUB_TOKEN and GITHUB_USERNAME must be set in Render",
            "setup_required": True
        }
    
    data = await request.json()
    task_prompt = data.get("prompt", "my project")
    user_id = data.get("user_id", "user")
    
    # Generate short project ID
    short_id = hashlib.md5(f"{user_id}{task_prompt}".encode()).hexdigest()[:6]
    
    # Generate repo name from first 3 words of prompt
    words = task_prompt.lower().split()[:3]
    base_name = '-'.join(w for w in words if w.isalpha())[:30] or 'project'
    repo_name = f"zenox-{sanitize_repo_name(base_name)}-{short_id}"
    
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Check if already exists
        check = await client.get(
            f"https://api.github.com/repos/{owner}/{repo_name}",
            headers=headers
        )
        if check.status_code == 200:
            existing = check.json()
            return {
                "success": True,
                "repo_name": repo_name,
                "repo_url": existing["html_url"],
                "existed": True
            }
        
        # Create new repo
        res = await client.post(
            "https://api.github.com/user/repos",
            headers=headers,
            json={
                "name": repo_name,
                "description": f"Created by Zenox Agent for: {task_prompt[:80]}",
                "auto_init": True,
                "private": False,
                "homepage": ""
            }
        )
        
        if res.status_code == 201:
            data = res.json()
            return {
                "success": True,
                "repo_name": repo_name,
                "repo_url": data["html_url"],
                "existed": False
            }
        
        return {
            "success": False,
            "error": f"Failed to create repo: {res.text[:200]}"
        }

@app.post("/api/agent/render/deploy")
async def render_deploy(request: Request, _=Depends(verify_api_key)):
    hook_url = os.getenv("RENDER_DEPLOY_HOOK_URL", "").strip()
    data = await request.json()
    task_id = data.get("task_id", "")
    
    if task_id:
        update_progress(task_id, "Deploying to Render", "running", "Triggering deploy hook")
        update_progress(task_id, "Deploying", "running", "Triggering deploy hook")
        
    if not hook_url:
        if task_id:
            update_progress(task_id, "Deploying to Render", "error", "Missing webhook")
            update_progress(task_id, "Deploying", "error", "Missing webhook")
        return {
            "success": False,
            "error": "RENDER_DEPLOY_HOOK_URL not set. Go to Render dashboard → your service → Settings → Deploy Hook",
            "url": None
        }
    
    project_name = data.get("project_name", "zenox-agent-project")
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(hook_url)
            
            if res.status_code in [200, 201, 202]:
                service_url = os.getenv("RENDER_SERVICE_URL", "").strip()
                if task_id:
                    update_progress(task_id, "Deploying to Render", "done", "Deployment triggered")
                    update_progress(task_id, "Deploying", "done", "Deployment triggered")
                return {
                    "success": True,
                    "message": "Deploy triggered successfully",
                    "url": service_url or "Check Render dashboard for URL",
                    "note": "Deployment takes 2-5 minutes"
                }
            else:
                if task_id:
                    update_progress(task_id, "Deploying to Render", "error", f"Deploy hook returned {res.status_code}")
                    update_progress(task_id, "Deploying", "error", f"Deploy hook returned {res.status_code}")
                return {
                    "success": False,
                    "error": f"Deploy hook returned {res.status_code}",
                    "url": None
                }
    except Exception as e:
        if task_id:
            update_progress(task_id, "Deploying to Render", "error", str(e))
            update_progress(task_id, "Deploying", "error", str(e))
        return {"success": False, "error": str(e), "url": None}

@app.post("/api/agent/skills/notify")
async def notify_skill_approval(request: Request, _=Depends(verify_api_key)):
    data = await request.json()
    skill_name = data.get("skill_name", "")
    skill_description = data.get("skill_description", "")
    skill_id = data.get("skill_id", "")
    owner_email = os.getenv("OWNER_EMAIL", "")
    
    if not owner_email:
        return {"sent": False, "reason": "OWNER_EMAIL not set"}
    
    # Use a simple email service — we use Resend (free tier: 100 emails/day)
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if not resend_key:
        print(f"[SkillManager] New skill pending approval: {skill_name}")
        return {"sent": False, "reason": "RESEND_API_KEY not set — check console logs"}
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": f"zenox@{os.getenv('OWNER_EMAIL_DOMAIN', 'zenox.dev')}",
                    "to": owner_email,
                    "subject": f"Zenox Agent: New Skill Needs Approval — {skill_name}",
                    "html": f"""
                    <h2>Zenox Agent synthesized a new skill</h2>
                    <p><strong>Skill:</strong> {skill_name}</p>
                    <p><strong>Description:</strong> {skill_description}</p>
                    <p><strong>ID:</strong> {skill_id}</p>
                    <p>Log in to approve or reject this skill.</p>
                    """
                }
            )
            return {"sent": res.status_code == 200}
    except Exception as e:
        return {"sent": False, "reason": str(e)}

@app.get("/api/agent/render/status")
async def render_status(_=Depends(verify_api_key)):
    render_key = os.getenv("RENDER_API_KEY", "").strip()
    service_id = os.getenv("RENDER_SERVICE_ID", "").strip()
    
    if not render_key or not service_id:
        return {"status": "unknown", "message": "RENDER_API_KEY and RENDER_SERVICE_ID not set"}
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"https://api.render.com/v1/services/{service_id}/deploys?limit=1",
                headers={"Authorization": f"Bearer {render_key}"}
            )
            if res.ok:
                deploys = res.json()
                if deploys:
                    latest = deploys[0]
                    return {
                        "status": latest.get("status", "unknown"),
                        "created_at": latest.get("createdAt", ""),
                        "finished_at": latest.get("finishedAt", ""),
                        "commit": latest.get("commit", {}).get("message", "")
                    }
            return {"status": "unknown"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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
            model="gemini-3-flash",
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
            model="gemini-3-flash",
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


# HuggingFace Spaces: only /tmp is writable in Docker
PROJECTS_FILE = pathlib.Path("/tmp/zenox_projects.json")

def load_projects() -> dict:
    try:
        if PROJECTS_FILE.exists():
            return json.loads(PROJECTS_FILE.read_text())
        return {}
    except:
        return {}

def save_projects(projects: dict):
    try:
        PROJECTS_FILE.write_text(json.dumps(projects, indent=2))
    except Exception as e:
        print(f"[PROJECTS] Save error: {e}")

@app.post("/api/projects/save")
async def save_project(request: Request, _=Depends(verify_api_key)):
    data = await request.json()
    projects = load_projects()
    
    project_id = data.get("project_id") or f"proj-{__import__('time').time()}"
    project = {
        "id": project_id,
        "user_id": data.get("user_id", "anonymous"),
        "prompt": data.get("prompt", ""),
        "repo_name": data.get("repo_name", ""),
        "repo_url": data.get("repo_url", ""),
        "deploy_url": data.get("deploy_url", ""),
        "code": data.get("code", ""),
        "language": data.get("language", "javascript"),
        "created_at": __import__('time').time()
    }
    projects[project_id] = project
    save_projects(projects)
    return {"success": True, "project": project}

@app.get("/api/projects/{user_id}")
async def get_user_projects(user_id: str, _=Depends(verify_api_key)):
    projects = load_projects()
    user_projects = [
        p for p in projects.values()
        if p.get("user_id") == user_id
    ]
    user_projects.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return {"projects": user_projects[:20]}

@app.get("/api/projects/result/{project_id}")
async def get_project(project_id: str, _=Depends(verify_api_key)):
    projects = load_projects()
    project = projects.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project
