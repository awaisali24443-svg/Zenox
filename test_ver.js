const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && python3 -m pip show google-generativeai | grep Version').toString();
  console.log("SUCCESS:", out);
} catch (e) {
  console.log("FAIL STDOUT:", e.stdout?.toString());
  console.log("FAIL STDERR:", e.stderr?.toString());
}
