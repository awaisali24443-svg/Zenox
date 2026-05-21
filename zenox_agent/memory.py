import json
import pathlib
import time

class Memory:
    def __init__(self, db_path="/tmp/zenox_memory.json"):
        self.db_path = pathlib.Path(db_path)
        self.data = self._load()
    
    def _load(self):
        if self.db_path.exists():
            try:
                return json.loads(self.db_path.read_text())
            except Exception:
                return {"episodes": [], "vectors": {}}
        return {"episodes": [], "vectors": {}}
        
    def _save(self):
        try:
            self.db_path.write_text(json.dumps(self.data))
        except Exception as e:
            print(f"Memory save error: {e}")
            
    def add_episode(self, task_id, prompt, plan, result):
        self.data["episodes"].append({
            "task_id": task_id,
            "prompt": prompt,
            "plan": plan,
            "result": result,
            "ts": time.time()
        })
        self._save()

memory = Memory()
