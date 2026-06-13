import asyncio
import time
from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
import google.generativeai as genai
from groq import Groq

GEMINI_MODELS = [
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash",
]

GROQ_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
]

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def _call_gemini_sync(model_name: str, messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_prompt if system_prompt else None
    )
    
    gemini_messages = []
    for msg in messages:
        role = "model" if msg["role"] in ["assistant", "model"] else "user"
        gemini_messages.append({"role": role, "parts": [msg["content"]]})
        
    response = model.generate_content(
        contents=gemini_messages,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
        )
    )
    return response.text

async def _try_gemini(model_name: str, messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    return await asyncio.to_thread(_call_gemini_sync, model_name, messages, system_prompt, max_tokens)

def _call_groq_sync(model_name: str, messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    client = Groq(api_key=GROQ_API_KEY)
    
    groq_messages = []
    if system_prompt:
        groq_messages.append({"role": "system", "content": system_prompt})
        
    for msg in messages:
        role = "assistant" if msg["role"] in ["assistant", "model"] else "user"
        groq_messages.append({"role": role, "content": msg["content"]})
        
    chat_completion = client.chat.completions.create(
        messages=groq_messages,
        model=model_name,
        max_tokens=max_tokens,
    )
    return chat_completion.choices[0].message.content

async def _try_groq(model_name: str, messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    return await asyncio.to_thread(_call_groq_sync, model_name, messages, system_prompt, max_tokens)

async def call_ai(
    messages: list[dict],
    system_prompt: str = "",
    max_tokens: int = 1000
) -> str:
    if GEMINI_API_KEY:
        for model_name in GEMINI_MODELS:
            try:
                print(f"[AI] Trying {model_name}...")
                start = time.time()
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        _call_gemini_sync,
                        model_name,
                        messages,
                        system_prompt,
                        max_tokens
                    ),
                    timeout=10.0
                )
                elapsed = round(time.time() - start, 2)
                print(f"[AI] {model_name} succeeded in {elapsed}s")
                return result
            except asyncio.TimeoutError:
                print(f"[AI] {model_name} timed out after 10s")
                continue
            except Exception as e:
                print(f"[AI] {model_name} failed: {type(e).__name__}: {e}")
                continue
    else:
        print("[AI] No Gemini key found in environment")

    if GROQ_API_KEY:
        for model_name in GROQ_MODELS:
            try:
                print(f"[AI] Trying Groq {model_name}...")
                start = time.time()
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        _call_groq_sync,
                        model_name,
                        messages,
                        system_prompt,
                        max_tokens
                    ),
                    timeout=10.0
                )
                elapsed = round(time.time() - start, 2)
                print(f"[AI] Groq {model_name} succeeded in {elapsed}s")
                return result
            except asyncio.TimeoutError:
                print(f"[AI] Groq {model_name} timed out after 10s")
                continue
            except Exception as e:
                print(f"[AI] Groq {model_name} failed: {type(e).__name__}: {e}")
                continue
    else:
        print("[AI] No Groq key found in environment")

    raise Exception(
        "All AI models unavailable. Please try again later."
    )

def get_available_providers() -> list[str]:
    providers = []
    if GEMINI_API_KEY:
        providers.append("gemini")
    if GROQ_API_KEY:
        providers.append("groq")
    return providers
