import json

async def generate_plan(prompt, client):
    instruction = "You are an autonomous agent planner. Generate a JSON list of steps to accomplish the task. Return ONLY a valid JSON array of strings."
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"system_instruction": instruction}
    )
    try:
        text = response.text.strip()
        if text.startswith("```json"): text = text[7:]
        if text.endswith("```"): text = text[:-3]
        return json.loads(text.strip())
    except:
        return ["Analyze task", "Generate initial solution", "Execute and test in sandbox", "Review and finalize"]
