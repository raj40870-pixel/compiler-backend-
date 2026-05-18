/**
 * JavaScript-specific fix test + additional stress tests
 */
const WebSocket = require('ws');

const PASS = (msg) => console.log(`  ✅ PASS: ${msg}`);
const FAIL = (msg) => console.log(`  ❌ FAIL: ${msg}`);
const LOG  = (msg) => console.log(`  📝 ${msg}`);

function runWsTest({ name, language, code, inputs, checks, timeoutMs = 20000 }) {
  return new Promise((resolve) => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TEST: ${name}`);
    
    const ws = new WebSocket('ws://localhost:8080/ws/run');
    const messages = [];
    let stdoutAcc = '';
    let stderrAcc = '';
    let done = false;
    let inputIdx = 0;

    const finish = () => {
      if (done) return;
      done = true;
      ws.close();
      const sysMsgs = messages.filter(m => m.type === 'system');
      if (sysMsgs.length === 0) PASS('Zero system messages');
      else FAIL('System messages found: ' + JSON.stringify(sysMsgs));
      checks.forEach(({ desc, fn }) => {
        if (fn(stdoutAcc, stderrAcc)) PASS(desc);
        else FAIL(desc + ` | stdout=${JSON.stringify(stdoutAcc.trim())}`);
      });
      LOG(`stdout: ${JSON.stringify(stdoutAcc.trim())}`);
      if (stderrAcc.trim()) LOG(`stderr: ${JSON.stringify(stderrAcc.trim())}`);
      resolve();
    };

    const sendNextInput = (delayMs) => {
      if (inputIdx >= inputs.length) return;
      const inp = inputs[inputIdx++];
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          LOG(`stdin: ${JSON.stringify(inp.data)}`);
          ws.send(JSON.stringify({ type: 'stdin', data: inp.data }));
          sendNextInput(inp.nextDelay || 700);
        }
      }, delayMs || inp.delay || 800);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language, code }));
      sendNextInput(inputs[0]?.delay || 1000);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (msg.type === 'stdout') stdoutAcc += msg.data;
      if (msg.type === 'stderr') stderrAcc += msg.data;
      if (msg.type === 'exit') finish();
    });
    ws.on('error', (err) => { FAIL('WS: ' + err.message); finish(); });
    setTimeout(() => { FAIL('TIMEOUT'); finish(); }, timeoutMs);
  });
}

const tests = [

  // ── JS: question-based (works with line-by-line stdin) ────────────
  {
    name: 'JavaScript — Student GPA (4 inputs via question)',
    language: 'javascript',
    code: `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));
(async () => {
  const name  = await ask('Name: ');
  const math  = parseFloat(await ask('Math marks: '));
  const sci   = parseFloat(await ask('Science marks: '));
  const eng   = parseFloat(await ask('English marks: '));
  rl.close();
  const avg = (math + sci + eng) / 3;
  const grade = avg >= 80 ? 'A' : avg >= 60 ? 'B' : 'C';
  console.log('--- Report ---');
  console.log('Student: ' + name);
  console.log('Average: ' + avg.toFixed(2));
  console.log('Grade: ' + grade);
})();
`,
    inputs: [
      { data: 'Arjun\n',  delay: 800 },
      { data: '88\n',     delay: 700 },
      { data: '92\n',     delay: 700 },
      { data: '76\n',     delay: 700 },
    ],
    checks: [
      { desc: 'Contains student name Arjun',        fn: o => o.includes('Arjun') },
      { desc: 'Shows correct average 85.33',        fn: o => o.includes('85.33') },
      { desc: 'Grade A',                            fn: o => o.includes('Grade: A') },
    ],
    timeoutMs: 15000,
  },

  // ── JS: 5-input billing (stress test) ────────────────────────────
  {
    name: 'JavaScript — Hotel Bill (5 inputs)',
    language: 'javascript',
    code: `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));
(async () => {
  const guest   = await ask('Guest name: ');
  const nights  = parseInt(await ask('Nights: '));
  const rateStr = await ask('Room rate/night: ');
  const meals   = parseInt(await ask('Meals count: '));
  const mealStr = await ask('Meal rate each: ');
  rl.close();
  const rate = parseFloat(rateStr);
  const mealR = parseFloat(mealStr);
  const total = nights * rate + meals * mealR;
  console.log('=== HOTEL BILL ===');
  console.log('Guest: ' + guest);
  console.log('Room: ' + nights + ' x ' + rate + ' = ' + (nights * rate));
  console.log('Meals: ' + meals + ' x ' + mealR + ' = ' + (meals * mealR));
  console.log('TOTAL: ' + total.toFixed(2));
})();
`,
    inputs: [
      { data: 'Mr. Kumar\n', delay: 800 },
      { data: '3\n',         delay: 700 },
      { data: '2500\n',      delay: 700 },
      { data: '6\n',         delay: 700 },
      { data: '350\n',       delay: 700 },
    ],
    checks: [
      { desc: 'Contains guest name Kumar',     fn: o => o.includes('Kumar') },
      { desc: 'Room = 7500 (3x2500)',          fn: o => o.includes('7500') },
      { desc: 'Meals = 2100 (6x350)',          fn: o => o.includes('2100') },
      { desc: 'TOTAL = 9600.00',               fn: o => o.includes('9600.00') },
    ],
    timeoutMs: 18000,
  },

  // ── Python: 6 inputs (stress) ─────────────────────────────────────
  {
    name: 'Python — Temperature Converter (6 values batch)',
    language: 'python',
    code: `
n = int(input("How many values? "))
results = []
for i in range(n):
    c = float(input(f"Celsius #{i+1}: "))
    f = c * 9 / 5 + 32
    results.append(f"{c}C = {f:.1f}F")
print("=== Results ===")
for r in results:
    print(r)
print(f"Done. {n} values converted.")
`,
    inputs: [
      { data: '4\n',   delay: 600 },
      { data: '0\n',   delay: 500 },
      { data: '100\n', delay: 500 },
      { data: '37\n',  delay: 500 },
      { data: '-40\n', delay: 500 },
    ],
    checks: [
      { desc: '0C = 32.0F',   fn: o => o.includes('0.0C = 32.0F') || o.includes('0C = 32.0F') },
      { desc: '100C = 212.0F',fn: o => o.includes('212.0F') },
      { desc: '37C = 98.6F',  fn: o => o.includes('98.6F') },
      { desc: '-40C = -40.0F',fn: o => o.includes('-40.0F') },
      { desc: '4 values converted', fn: o => o.includes('4 values converted') },
    ],
    timeoutMs: 18000,
  },

  // ── C: 10 inputs (maximum stress) ────────────────────────────────
  {
    name: 'C — Highest Score Finder (N=8, then 8 scores)',
    language: 'c',
    code: `
#include <stdio.h>
int main() {
    int n;
    printf("Students: ");
    scanf("%d", &n);
    float scores[50];
    float max = -1, min = 999999;
    float sum = 0;
    for (int i = 0; i < n; i++) {
        printf("Score %d: ", i + 1);
        scanf("%f", &scores[i]);
        sum += scores[i];
        if (scores[i] > max) max = scores[i];
        if (scores[i] < min) min = scores[i];
    }
    printf("Max: %.1f\\n", max);
    printf("Min: %.1f\\n", min);
    printf("Avg: %.2f\\n", sum / n);
    return 0;
}
`,
    inputs: [
      { data: '6\n',  delay: 2000 },
      { data: '78\n', delay: 500 },
      { data: '92\n', delay: 500 },
      { data: '55\n', delay: 500 },
      { data: '88\n', delay: 500 },
      { data: '67\n', delay: 500 },
      { data: '95\n', delay: 500 },
    ],
    checks: [
      { desc: 'Max = 95.0',         fn: o => o.includes('Max: 95.0') },
      { desc: 'Min = 55.0',         fn: o => o.includes('Min: 55.0') },
      { desc: 'Avg = 79.17',        fn: o => o.includes('Avg: 79.17') },
    ],
    timeoutMs: 25000,
  },

];

(async () => {
  console.log('\n' + '═'.repeat(60));
  console.log(' JS FIX + STRESS TESTS');
  console.log('═'.repeat(60));
  for (const t of tests) {
    await runWsTest(t);
    await new Promise(r => setTimeout(r, 600));
  }
  console.log('\n' + '═'.repeat(60));
  console.log(' STRESS TESTS COMPLETE');
  console.log('═'.repeat(60));
})();
