import asyncio
import httpx
import os

async def main():
    async with httpx.AsyncClient() as client:
        # Use our backend running on port 3000
        response = await client.post(
            "http://0.0.0.0:3000/api/chat",
            json={"message": "Hi", "history": []},
            headers={"x-api-key": "zenox-secret"}
        )
        print("Status", response.status_code)
        
        async for chunk in response.aiter_text():
            print(chunk, end="", flush=True)

asyncio.run(main())
