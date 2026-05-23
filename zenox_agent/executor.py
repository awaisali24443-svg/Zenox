from zenox_agent.tools import registry
import os
import httpx
import re
import hashlib
import base64
import asyncio

async def generate_code(prompt, language, client, task_type):
    code_prompt = (
        f"Create a complete single-file HTML website with embedded CSS and JS. Professional. Task: {prompt}" if task_type == "website" else
        f"Write a complete Python script with comments. Task: {prompt}" if task_type in ("python_script", "script") else
        f"Write complete JavaScript code with comments. Task: {prompt}"
    )
    res = await client.aio.models.generate_content(model="gemini-3-flash", contents=code_prompt)
    code = res.text or ""
    for fence in ["```html","```python","```javascript","```js","```py","```"]:
        code = code.replace(fence, "")
    return code.strip()

async def execute_code(code, language):
    e2b_key = os.getenv("E2B_API_KEY", "").strip()
    if not e2b_key or len(code) < 10:
        return "Skipped or no key"
    try:
        async with asyncio.timeout(30):
            async with httpx.AsyncClient(timeout=28.0) as hc:
                cr = await hc.post(
                    "https://api.e2b.dev/sandboxes",
                    headers={"X-Api-Key":e2b_key,"Content-Type":"application/json"},
                    json={"templateID":"base"}
                )
                if cr.status_code == 200:
                    sid = cr.json().get("sandboxID","")
                    cmd = f"node -e {repr(code[:500])}" if language=="javascript" else f"python3 -c {repr(code[:500])}"
                    er = await hc.post(
                        f"https://api.e2b.dev/sandboxes/{sid}/exec",
                        headers={"X-Api-Key":e2b_key,"Content-Type":"application/json"},
                        json={"cmd":cmd}
                    )
                    exec_result = er.json().get("stdout","") or "Executed"
                    await hc.delete(f"https://api.e2b.dev/sandboxes/{sid}", headers={"X-Api-Key":e2b_key})
                    return exec_result
    except Exception as e:
        return str(e)
    return "Error"

registry.register("generate_code", "Generate raw code based on prompt", generate_code)
registry.register("execute_sandboxed_code", "Run code in a secure E2B sandbox", execute_code)
