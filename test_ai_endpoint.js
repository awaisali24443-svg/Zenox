const http = require('http');

http.get('http://127.0.0.1:8000/test-ai', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Response:', data);
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
