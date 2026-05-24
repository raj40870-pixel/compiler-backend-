const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/run');

const code = `process.stdout.write('Enter number: ');
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.once('data', (data) => {
  const n = data.trim();
  console.log('You entered: ' + n);
  process.stdin.pause();
});`;

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'run', language: 'javascript', code }));
  setTimeout(() => {
    console.log('Sending stdin: 42');
    ws.send(JSON.stringify({ type: 'stdin', data: '42\n' }));
  }, 800);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log('MSG:', JSON.stringify(msg));
  if (msg.type === 'exit') {
    console.log('Process exited with:', msg.data);
    ws.close();
    process.exit(0);
  }
});

ws.on('close', () => {
  console.log('WS closed');
  process.exit(0);
});

setTimeout(() => {
  console.log('TIMEOUT!');
  ws.close();
  process.exit(1);
}, 15000);
