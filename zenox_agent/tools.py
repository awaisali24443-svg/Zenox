import os
import httpx
import asyncio
import urllib.parse

class ToolRegistry:
    def __init__(self):
        self.tools = {}
        
    def register(self, name: str, description: str, func):
        self.tools[name] = {"desc": description, "func": func}
        
    def get_tool(self, name: str):
        return self.tools.get(name)
    
    def list_all(self) -> list:
        return [{"name": k, "description": v["desc"]} for k, v in self.tools.items()]
    
    async def run(self, name: str, **kwargs) -> str:
        tool = self.get_tool(name)
        if not tool:
            return f"Tool '{name}' not found. Available: {[k for k in self.tools]}"
        try:
            result = await tool["func"](**kwargs)
            return str(result)
        except Exception as e:
            return f"Tool error ({name}): {str(e)}"

async def _web_search(query: str) -> str:
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1"
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, headers={"User-Agent": "Zenox/1.0"})
            data = r.json()
        results = []
        if data.get("AbstractText"):
            results.append(data["AbstractText"])
        for topic in data.get("RelatedTopics", [])[:2]:
            if isinstance(topic, dict) and topic.get("Text"):
                results.append(topic["Text"])
        return "\n".join(results) if results else "No results found"
    except Exception as e:
        return f"Search error: {str(e)}"

async def _read_file(path: str) -> str:
    try:
        import pathlib
        p = pathlib.Path(path)
        if not p.exists():
            return f"File not found: {path}"
        if p.stat().st_size > 100_000:
            return "File too large (max 100KB)"
        return p.read_text(errors="replace")
    except Exception as e:
        return f"Read error: {str(e)}"

async def _write_file(path: str, content: str) -> str:
    try:
        import pathlib
        p = pathlib.Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return f"Written {len(content)} chars to {path}"
    except Exception as e:
        return f"Write error: {str(e)}"

# Create the global registry instance
registry = ToolRegistry()

# Register all available tools
registry.register("web_search", "Search the web for current information", _web_search)
registry.register("read_file", "Read a file from the filesystem", _read_file)
registry.register("write_file", "Write content to a file", _write_file)