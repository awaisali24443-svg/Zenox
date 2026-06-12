import asyncio
from app.global.config import GEMINI_API_KEY, GROQ_API_KEY
import google.generativeai as genai
from groq import Groq

GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.5-flash-preview-05-20",
    "gemini-1.5-pro",
]

GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
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
                response = await _try_gemini(model_name, messages, system_prompt, max_tokens)
                print(f"[AI Fallback] Successfully used Gemini model: {model_name}")
                return response
            except Exception as e:
                print(f"[AI Fallback] Gemini model {model_name} failed: {e}")
                
    if GROQ_API_KEY:
        for model_name in GROQ_MODELS:
            try:
                response = await _try_groq(model_name, messages, system_prompt, max_tokens)
                print(f"[AI Fallback] Successfully used Groq model: {model_name}")
                return response
            except Exception as e:
                print(f"[AI Fallback] Groq model {model_name} failed: {e}")

    raise Exception("All AI models unavailable. Please try again later.")

def get_available_providers() -> list[str]:
    providers = []
    if GEMINI_API_KEY:
        providers.append("gemini")
    if GROQ_API_KEY:
        providers.append("groq")
    return providers
