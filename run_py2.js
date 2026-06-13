const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && python3 -m pip install -r requirements.txt && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8080 > out.log 2>&1 &').toString();
} catch(e) {
  console.log(e.stdout?.toString());
  console.log(e.stderr?.toString());
}
