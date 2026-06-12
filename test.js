const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && . venv/bin/activate 2>/dev/null || true && python -c "import sys; sys.path.append(\'.\'); from app.core.database import supabase; print(\'DB OK:\', supabase)"').toString();
  console.log("SUCCESS:", out);
} catch (e) {
  console.log("FAIL STDOUT:", e.stdout?.toString());
  console.log("FAIL STDERR:", e.stderr?.toString());
}
