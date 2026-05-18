const WebSocket = require('ws');

console.log('--- Java stdin test ---');
const ws = new WebSocket('ws://localhost:8080/ws/run');
let stdoutAcc = '';
let messages = [];

const javaCode = `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("Enter age: ");
        System.out.flush();
        int age = scanner.nextInt();
        System.out.println("Age is: " + age);
    }
}`;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'run', language: 'java', code: javaCode }));
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('[STDIN] Sending: 99');
      ws.send(JSON.stringify({ type: 'stdin', data: '99\n' }));
    }
  }, 3000);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  messages.push(msg);
  if (msg.type === 'stdout') stdoutAcc += msg.data;
  if (msg.type === 'stderr' && msg.data.trim()) console.log('[stderr]', msg.data.trim());
  if (msg.type === 'exit') {
    ws.close();
    const sysmsgs = messages.filter(m => m.type === 'system');
    const out = stdoutAcc.trim();
    console.log('Output:', JSON.stringify(out));
    console.log(sysmsgs.length === 0 ? 'PASS: Zero system messages' : 'FAIL: System messages: ' + JSON.stringify(sysmsgs));
    console.log(out.includes('Age is: 99') ? 'PASS: Java stdin works' : 'FAIL: Expected "Age is: 99" in output');
  }
});

ws.on('error', err => console.error('Error:', err.message));
setTimeout(() => { ws.close(); process.exit(0); }, 15000);
