/**
 * FULL QA TEST SUITE - All 5 Languages, Multiple Inputs, Zero System Logs
 * Tests WebSocket backend at ws://localhost:8080/ws/run
 */
const WebSocket = require('ws');

const PASS = (msg) => console.log(`  ✅ PASS: ${msg}`);
const FAIL = (msg) => console.log(`  ❌ FAIL: ${msg}`);
const LOG  = (msg) => console.log(`  📝 ${msg}`);

function runWsTest({ name, language, code, inputs, checks, timeoutMs = 15000 }) {
  return new Promise((resolve) => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TEST: ${name}`);
    console.log(`Language: ${language.toUpperCase()}`);

    const ws = new WebSocket('ws://localhost:8080/ws/run');
    const messages = [];
    let stdoutAcc = '';
    let stderrAcc = '';
    let done = false;
    let inputIdx = 0;
    let pendingTimer = null;

    const finish = (reason) => {
      if (done) return;
      done = true;
      if (pendingTimer) clearTimeout(pendingTimer);
      ws.close();

      // Check 1: Zero system messages
      const sysMsgs = messages.filter(m => m.type === 'system');
      if (sysMsgs.length === 0) PASS('Zero system messages'); 
      else FAIL(`System messages found: ${JSON.stringify(sysMsgs)}`);

      // Check 2: No [System] or Compiling in stdout/stderr
      const badLines = (stdoutAcc + stderrAcc).split(/\r?\n/).filter(l => {
        const t = l.trim();
        return /^\[System\]/i.test(t) || /^(Compiling|Starting|Initializing|Process\s+exited)/i.test(t);
      });
      if (badLines.length === 0) PASS('No system log contamination in output');
      else FAIL(`System log found in output: ${JSON.stringify(badLines)}`);

      // Run user-defined checks
      checks.forEach(({ desc, fn }) => {
        try {
          if (fn(stdoutAcc, stderrAcc)) PASS(desc);
          else FAIL(desc + ` | stdout=${JSON.stringify(stdoutAcc.trim())} stderr=${JSON.stringify(stderrAcc.trim())}`);
        } catch(e) {
          FAIL(desc + ` | Error: ${e.message}`);
        }
      });

      LOG(`Full stdout: ${JSON.stringify(stdoutAcc.trim())}`);
      if (stderrAcc.trim()) LOG(`stderr: ${JSON.stringify(stderrAcc.trim())}`);
      resolve();
    };

    const scheduleNextInput = () => {
      if (inputIdx >= inputs.length) return;
      const inp = inputs[inputIdx++];
      const delay = inp.delay || 1000;
      pendingTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          LOG(`Sending stdin[${inputIdx}]: ${JSON.stringify(inp.data)}`);
          ws.send(JSON.stringify({ type: 'stdin', data: inp.data }));
          scheduleNextInput();
        }
      }, delay);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language, code }));
      scheduleNextInput();
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (msg.type === 'stdout') stdoutAcc += msg.data;
      if (msg.type === 'stderr') stderrAcc += msg.data;
      if (msg.type === 'exit') finish('exit received');
    });

    ws.on('error', (err) => {
      FAIL(`WebSocket error: ${err.message}`);
      finish('ws error');
    });

    setTimeout(() => finish('timeout'), timeoutMs);
  });
}

// ════════════════════════════════════════════════════════════════════
//  TEST DEFINITIONS
// ════════════════════════════════════════════════════════════════════

const tests = [

  // ── 1. JavaScript: Calculator with 3 inputs ──────────────────────
  {
    name: 'JavaScript — Simple Calculator (3 inputs: num1, num2, op)',
    language: 'javascript',
    code: `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
rl.on('line', (line) => lines.push(line.trim()));
rl.on('close', () => {
  const a = parseFloat(lines[0]);
  const b = parseFloat(lines[1]);
  const op = lines[2];
  let result;
  if (op === '+') result = a + b;
  else if (op === '-') result = a - b;
  else if (op === '*') result = a * b;
  else if (op === '/') result = a / b;
  console.log('Result:', result);
});
rl.on('SIGINT', () => rl.close());
`,
    inputs: [
      { data: '25\n', delay: 600 },
      { data: '75\n', delay: 600 },
      { data: '+\n', delay: 600 },
    ],
    checks: [
      { desc: 'Output shows Result: 100', fn: (o) => o.includes('Result: 100') },
    ],
    timeoutMs: 10000,
  },

  // ── 2. Python: Student Report with 5 inputs ───────────────────────
  {
    name: 'Python — Student Report (5 inputs: name, age, math, sci, eng)',
    language: 'python',
    code: `
name = input("Name: ")
age  = int(input("Age: "))
math = int(input("Math: "))
sci  = int(input("Science: "))
eng  = int(input("English: "))
avg  = (math + sci + eng) / 3
grade = "A" if avg >= 80 else "B" if avg >= 60 else "C"
print(f"Student: {name}, Age: {age}")
print(f"Average: {avg:.1f}, Grade: {grade}")
`,
    inputs: [
      { data: 'Rahul\n',   delay: 600 },
      { data: '18\n',      delay: 600 },
      { data: '85\n',      delay: 600 },
      { data: '90\n',      delay: 600 },
      { data: '78\n',      delay: 600 },
    ],
    checks: [
      { desc: 'Output contains student name Rahul', fn: (o) => o.includes('Rahul') },
      { desc: 'Output shows average 84.3',           fn: (o) => o.includes('84.3') },
      { desc: 'Output shows Grade: A',               fn: (o) => o.includes('Grade: A') },
    ],
    timeoutMs: 15000,
  },

  // ── 3. Java: Shopping Bill with 4 inputs ─────────────────────────
  {
    name: 'Java — Shopping Bill (4 inputs: 2 items + qty each)',
    language: 'java',
    code: `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("Item1 price: ");
        double p1 = sc.nextDouble();
        System.out.print("Item1 qty: ");
        int q1 = sc.nextInt();
        System.out.print("Item2 price: ");
        double p2 = sc.nextDouble();
        System.out.print("Item2 qty: ");
        int q2 = sc.nextInt();
        double total = p1 * q1 + p2 * q2;
        System.out.printf("Total Bill: %.2f%n", total);
    }
}
`,
    inputs: [
      { data: '49.99\n', delay: 800 },
      { data: '3\n',     delay: 600 },
      { data: '15.50\n', delay: 600 },
      { data: '5\n',     delay: 600 },
    ],
    checks: [
      { desc: 'Output contains Total Bill: 227.47', fn: (o) => o.includes('227.47') },
    ],
    timeoutMs: 20000,
  },

  // ── 4. C++: Fibonacci with 1 input ───────────────────────────────
  {
    name: 'C++ — Fibonacci (1 input: N terms)',
    language: 'cpp',
    code: `
#include <iostream>
using namespace std;
int main() {
    int n;
    cout << "Enter N: ";
    cin >> n;
    long long a = 0, b = 1;
    cout << "Fibonacci: ";
    for (int i = 0; i < n; i++) {
        cout << a;
        if (i < n - 1) cout << " ";
        long long temp = a + b;
        a = b;
        b = temp;
    }
    cout << endl;
    return 0;
}
`,
    inputs: [
      { data: '8\n', delay: 2000 },
    ],
    checks: [
      { desc: 'Output contains Fibonacci sequence starting 0 1 1 2 3 5 8 13',
        fn: (o) => o.includes('0 1 1 2 3 5 8 13') },
    ],
    timeoutMs: 20000,
  },

  // ── 5. C: Array sum with 6 inputs (N=5 + 5 numbers) ─────────────
  {
    name: 'C — Array Sum (6 inputs: N + N numbers)',
    language: 'c',
    code: `
#include <stdio.h>
int main() {
    int n;
    printf("How many numbers? ");
    scanf("%d", &n);
    int arr[100];
    int sum = 0;
    for (int i = 0; i < n; i++) {
        printf("Enter num %d: ", i + 1);
        scanf("%d", &arr[i]);
        sum += arr[i];
    }
    printf("Sum = %d\\n", sum);
    printf("Average = %.2f\\n", (double)sum / n);
    return 0;
}
`,
    inputs: [
      { data: '5\n',   delay: 2000 },
      { data: '10\n',  delay: 500 },
      { data: '20\n',  delay: 500 },
      { data: '30\n',  delay: 500 },
      { data: '40\n',  delay: 500 },
      { data: '50\n',  delay: 500 },
    ],
    checks: [
      { desc: 'Output shows Sum = 150',      fn: (o) => o.includes('Sum = 150') },
      { desc: 'Output shows Average = 30.00', fn: (o) => o.includes('Average = 30.00') },
    ],
    timeoutMs: 25000,
  },

];

// ════════════════════════════════════════════════════════════════════
//  RUN ALL TESTS
// ════════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n' + '═'.repeat(60));
  console.log(' FULL QA SUITE — All 5 Languages, Multiple Inputs');
  console.log('═'.repeat(60));

  for (const test of tests) {
    await runWsTest(test);
    // Small gap between tests
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('\n' + '═'.repeat(60));
  console.log(' ALL TESTS COMPLETE');
  console.log('═'.repeat(60));
})();
