const WebSocket = require('ws');

console.log('--- C++ stdin test ---');
const ws = new WebSocket('ws://localhost:8080/ws/run');
let stdoutAcc = '';
let stderrAcc = '';
let messages = [];

const cppCode = `#include <iostream>
using namespace std;
int main() {
    cout << "Enter a number: ";
    int x;
    cin >> x;
    cout << "You entered: " << x << endl;
    return 0;
}`;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'run', language: 'cpp', code: cppCode }));
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('[STDIN] Sending: 42');
      ws.send(JSON.stringify({ type: 'stdin', data: '42\n' }));
    }
  }, 3000);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  messages.push(msg);
  if (msg.type === 'stdout') stdoutAcc += msg.data;
  if (msg.type === 'stderr') stderrAcc += msg.data;
  if (msg.type === 'exit') {
    ws.close();
    const sysmsgs = messages.filter(m => m.type === 'system');
    const out = stdoutAcc.trim();
    console.log('stdout:', JSON.stringify(out));
    if (stderrAcc.trim()) console.log('stderr:', stderrAcc.trim());
    console.log(sysmsgs.length === 0 ? 'PASS: Zero system messages' : 'FAIL: System messages: ' + JSON.stringify(sysmsgs));
    console.log(out.includes('You entered: 42') ? 'PASS: C++ stdin works' : 'FAIL: Expected "You entered: 42" in output, got: ' + JSON.stringify(out));
  }
});

ws.on('error', err => console.error('Error:', err.message));
setTimeout(() => { ws.close(); process.exit(0); }, 15000);
