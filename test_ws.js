const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/run');
const messages = [];

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'run',
    language: 'javascript',
    code: 'console.log("Hello World");'
  }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  messages.push(msg);
  if (msg.type === 'exit') {
    ws.close();
    console.log('=== RECEIVED MESSAGES ===');
    messages.forEach(m => {
      console.log(`[${m.type}] ${JSON.stringify(m.data)}`);
    });

    const systemMessages = messages.filter(m => m.type === 'system');
    const stdoutMessages = messages.filter(m => m.type === 'stdout');

    console.log('');
    if (systemMessages.length > 0) {
      console.log('FAIL: System messages found:', systemMessages);
    } else {
      console.log('PASS: Zero system messages');
    }

    const output = stdoutMessages.map(m => m.data).join('').trim();
    if (output === 'Hello World') {
      console.log('PASS: Output is exactly "Hello World"');
    } else {
      console.log('FAIL: Output was:', JSON.stringify(output));
    }
  }
});

ws.on('error', (err) => console.error('WS error:', err));
setTimeout(() => { ws.close(); process.exit(1); }, 10000);
