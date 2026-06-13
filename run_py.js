const { execSync } = require('child_process');
try {
  let out = execSync('cd backend && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt && python -m uvicorn app.main:app --host 127.0.0.1 --port 8080 > out.log 2>&1 &', { shell: true});
  console.log('done');
} catch(e) {
  console.log(e);
}
