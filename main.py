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
        "version": "5.0",
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
        return {"type": "general", "language": "javascript", "steps": []}
    
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
    else:
        task_type = "general"
        language = "javascript"
    
    steps_map = {
        "website": [
            "Analyzing your requirements",
            "Designing the layout and structure",
            "Writing HTML and CSS",
            "Adding JavaScript interactions",
            "Testing the result",
            "Committing to GitHub",
            "Deploying to Render"
        ],
        "python_script": [
            "Understanding the requirements",
            "Writing the Python script",
            "Testing execution",
            "Committing to GitHub"
        ],
        "api": [
            "Designing the API structure",
            "Writing the server code",
            "Adding error handling",
            "Testing endpoints",
            "Deploying"
        ],
        "general": [
            "Analyzing your request",
            "Generating solution",
            "Testing",
            "Saving result"
        ]
    }
    
    return {
        "type": task_type,
        "language": language,
        "steps": steps_map.get(task_type, steps_map["general"])
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
            model="gemini-2.5-flash",
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
            import httpx
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
            model="gemini-2.5-flash",
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
    import re
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
    import hashlib
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
                    "from": "zenox@yourdomain.com",
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

import json, pathlib

PROJECTS_FILE = pathlib.Path("projects.json")

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
