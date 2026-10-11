const WebSocket = require('ws');

const url = 'wss://tiny-silence-47c5.killermenlol001.workers.dev/?v=10&encoding=json';
console.log('Conectando a', url);
const ws = new WebSocket(url, { headers: { 'X-Relay-Key': 'enp-cnp-7d4f1a' } });

ws.on('open', () => {
  console.log('OPEN OK');
  ws.send(JSON.stringify({ op: 10, d: {} }));
});
ws.on('message', (d) => {
  console.log('MSG:', d.toString().slice(0, 200));
  ws.close();
});
ws.on('unexpected-response', (req, res) => {
  console.log('UNEXPECTED RESPONSE:', res.statusCode);
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => console.log('BODY:', body.slice(0, 300)));
});
ws.on('error', (e) => console.log('ERROR:', e.message));
ws.on('close', (c, r) => { console.log('CLOSE:', c, r && r.toString()); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
