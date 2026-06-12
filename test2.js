const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && python3 -c "import sys; sys.path.append(\'.\'); from app.core.database import supabase; print(\'DB OK:\', supabase)"').toString();
  console.log("SUCCESS:", out);
} catch (e) {
  console.log("FAIL STDOUT:", e.stdout?.toString());
  console.log("FAIL STDERR:", e.stderr?.toString());
}
