const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && . venv/bin/activate 2>/dev/null || true && python3 -c "import asyncio; import sys; sys.path.append(\'.\'); from app.core.ai_provider import call_ai; print(asyncio.run(call_ai([{\'role\':\'user\',\'content\':\'hey\'}])))" 2>&1').toString();
  console.log("OUT:", out);
} catch (e) {
  console.log("ERR:", e.stdout?.toString() || e.message);
}
