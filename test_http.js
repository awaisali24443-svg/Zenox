const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 8000,
  path: '/chat/message',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer doesnotmatter'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => console.log('RESPONSE:', res.statusCode, data));
});

req.on('error', (e) => console.error('ERROR:', e));
req.write(JSON.stringify({
  session_id: 'test',
  content: 'hello',
  history: []
}));
req.end();
