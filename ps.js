const { execSync } = require('child_process');
try {
  console.log(execSync('ps x').toString());
} catch(e) {}
