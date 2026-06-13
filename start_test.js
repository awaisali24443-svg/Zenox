const { execSync } = require('child_process');
try {
  let log = execSync('npm run start:backend > /backend/backend.log 2>&1 &').toString();
} catch(e) {}
