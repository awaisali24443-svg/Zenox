const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && . venv/bin/activate 2>/dev/null || true && python -c "import asyncio; import sys; sys.path.append(\'.\'); from app.core.ai_provider import call_ai; print(asyncio.run(call_ai([{\'role\':\'user\',\'content\':\'hey\'}])))"').toString();
  console.log("SUCCESS:", out);
} catch (e) {
  console.log("FAIL STDOUT:", e.stdout?.toString());
  console.log("FAIL STDERR:", e.stderr?.toString());
}
