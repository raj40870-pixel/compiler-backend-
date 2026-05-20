/**
 * FINAL COMPREHENSIVE QA REPORT
 * All 5 languages, multiple inputs, zero system logs verification
 */
const WebSocket = require('ws');

let totalPassed = 0;
let totalFailed = 0;
const results = [];

const PASS = (label, msg) => { totalPassed++; console.log(`  ✅ ${msg}`); results.push({ label, status: 'PASS', msg }); };
const FAIL = (label, msg) => { totalFailed++; console.log(`  ❌ ${msg}`); results.push({ label, status: 'FAIL', msg }); };
const LOG  = (msg) => console.log(`     ${msg}`);

function runTest({ name, language, code, inputs, checks, compileWait = 0, timeoutMs = 20000 }) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(62)}`);
    console.log(`  🔬 ${name}`);
    console.log(`${'─'.repeat(62)}`);

    const ws = new WebSocket('ws://localhost:8080/ws/run');
    const msgs = [];
    let stdout = '', stderr = '';
    let done = false;
    let inputSent = 0;

    const finish = () => {
      if (done) return; done = true; ws.close();

      // Check: zero system messages
      const sysMsgs = msgs.filter(m => m.type === 'system');
      if (sysMsgs.length === 0) PASS(name, 'Zero system messages in WS stream');
      else FAIL(name, `System messages found: ${JSON.stringify(sysMsgs)}`);

      // Check: no [System] contamination in actual output
      const contamLines = (stdout + stderr).split(/\r?\n/).filter(l => {
        const t = l.trim();
        return /^\[System\]/i.test(t) || /^(Compiling|Starting|Initializing|Process\s+exited)/i.test(t);
      });
      if (contamLines.length === 0) PASS(name, 'No system log contamination in terminal output');
      else FAIL(name, `System log in output: ${JSON.stringify(contamLines)}`);

      // Run custom output checks
      checks.forEach(({ desc, fn }) => {
        if (fn(stdout, stderr)) PASS(name, desc);
        else FAIL(name, `${desc} | got: ${JSON.stringify(stdout.trim().slice(0, 200))}`);
      });

      LOG(`stdout: ${JSON.stringify(stdout.trim().slice(0, 300))}`);
      if (stderr.trim()) LOG(`stderr: ${stderr.trim().slice(0, 200)}`);
      resolve();
    };

    // Schedule inputs with proper delays
    const scheduleInputs = () => {
      let delay = compileWait;
      inputs.forEach((inp, i) => {
        delay += (i === 0 ? 0 : (inp.gap || 600));
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            LOG(`→ stdin[${i+1}]: ${JSON.stringify(inp.data)}`);
            ws.send(JSON.stringify({ type: 'stdin', data: inp.data }));
            inputSent++;
          }
        }, delay);
        delay += (inp.gap || 600);
      });
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language, code }));
      scheduleInputs();
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      msgs.push(m);
      if (m.type === 'stdout') stdout += m.data;
      if (m.type === 'stderr') stderr += m.data;
      if (m.type === 'exit') finish();
    });
    ws.on('error', err => { FAIL(name, 'WS error: ' + err.message); finish(); });
    setTimeout(() => { FAIL(name, `Timed out after ${timeoutMs}ms`); finish(); }, timeoutMs);
  });
}

const TESTS = [

  // ── 1. JAVASCRIPT: Hotel Bill 5 inputs ──────────────────────────
  {
    name: 'JAVASCRIPT — Hotel Bill Calculator (5 inputs)',
    language: 'javascript',
    code: `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));
(async () => {
  const guest  = await ask('Guest name: ');
  const nights = parseInt(await ask('Nights: '));
  const rate   = parseFloat(await ask('Rate/night: '));
  const meals  = parseInt(await ask('Meals: '));
  const mRate  = parseFloat(await ask('Meal rate: '));
  rl.close();
  const roomTotal = nights * rate;
  const mealTotal = meals * mRate;
  const grand = roomTotal + mealTotal;
  console.log('=== HOTEL BILL ===');
  console.log('Guest: ' + guest);
  console.log('Room (' + nights + 'x' + rate + '): ' + roomTotal);
  console.log('Meals (' + meals + 'x' + mRate + '): ' + mealTotal);
  console.log('GRAND TOTAL: ' + grand.toFixed(2));
})();
`,
    inputs: [
      { data: 'Vikram Singh\n', gap: 800 },
      { data: '4\n',            gap: 700 },
      { data: '3000\n',         gap: 700 },
      { data: '8\n',            gap: 700 },
      { data: '250\n',          gap: 700 },
    ],
    checks: [
      { desc: 'Shows guest name Vikram Singh', fn: o => o.includes('Vikram Singh') },
      { desc: 'Room total = 12000 (4×3000)',   fn: o => o.includes('12000') },
      { desc: 'Meal total = 2000 (8×250)',     fn: o => o.includes('2000') },
      { desc: 'Grand total = 14000.00',        fn: o => o.includes('14000.00') },
    ],
    compileWait: 300,
    timeoutMs: 15000,
  },

  // ── 2. PYTHON: Student Report 5 inputs ──────────────────────────
  {
    name: 'PYTHON — Student Report Card (5 inputs)',
    language: 'python',
    code: `
name  = input("Name: ")
roll  = input("Roll No: ")
m1    = int(input("Math: "))
m2    = int(input("Science: "))
m3    = int(input("English: "))
total = m1 + m2 + m3
avg   = total / 3
grade = "A+" if avg >= 90 else "A" if avg >= 80 else "B" if avg >= 60 else "C"
print("===== REPORT CARD =====")
print(f"Name: {name} | Roll: {roll}")
print(f"Math: {m1} | Sci: {m2} | Eng: {m3}")
print(f"Total: {total} | Average: {avg:.1f} | Grade: {grade}")
`,
    inputs: [
      { data: 'Priya Sharma\n', gap: 700 },
      { data: 'R-42\n',         gap: 600 },
      { data: '95\n',           gap: 600 },
      { data: '88\n',           gap: 600 },
      { data: '91\n',           gap: 600 },
    ],
    checks: [
      { desc: 'Shows Priya Sharma',           fn: o => o.includes('Priya Sharma') },
      { desc: 'Shows Roll R-42',              fn: o => o.includes('R-42') },
      { desc: 'Total = 274 (95+88+91)',       fn: o => o.includes('274') },
      { desc: 'Average = 91.3',              fn: o => o.includes('91.3') },
      { desc: 'Grade = A+',                  fn: o => o.includes('A+') },
    ],
    compileWait: 300,
    timeoutMs: 15000,
  },

  // ── 3. JAVA: Salary Calculator 4 inputs ─────────────────────────
  {
    name: 'JAVA — Salary Calculator (4 inputs)',
    language: 'java',
    code: `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("Employee: ");
        String name = sc.nextLine();
        System.out.print("Basic salary: ");
        double basic = sc.nextDouble();
        System.out.print("HRA percent: ");
        double hraP = sc.nextDouble();
        System.out.print("Tax percent: ");
        double taxP = sc.nextDouble();
        double hra = basic * hraP / 100;
        double tax = basic * taxP / 100;
        double net = basic + hra - tax;
        System.out.println("=== PAYSLIP ===");
        System.out.printf("Employee: %s%n", name);
        System.out.printf("Basic: %.2f%n", basic);
        System.out.printf("HRA: %.2f%n", hra);
        System.out.printf("Tax: %.2f%n", tax);
        System.out.printf("Net Salary: %.2f%n", net);
    }
}
`,
    inputs: [
      { data: 'Aditya Kumar\n', gap: 2500 },  // wait for java compile
      { data: '50000\n',        gap: 700 },
      { data: '20\n',           gap: 700 },
      { data: '10\n',           gap: 700 },
    ],
    checks: [
      { desc: 'Shows Aditya Kumar',          fn: o => o.includes('Aditya Kumar') },
      { desc: 'Basic = 50000.00',            fn: o => o.includes('50000.00') },
      { desc: 'HRA = 10000.00 (20%)',        fn: o => o.includes('10000.00') },
      { desc: 'Net = 55000.00',              fn: o => o.includes('55000.00') },
    ],
    compileWait: 0,
    timeoutMs: 35000,
  },

  // ── 4. C++: Array statistics 8 inputs ───────────────────────────
  {
    name: 'C++ — Array Statistics (1 + 7 = 8 inputs)',
    language: 'cpp',
    code: `
#include <iostream>
#include <algorithm>
using namespace std;
int main() {
    int n;
    cout << "Count: ";
    cin >> n;
    float arr[100], sum = 0;
    for (int i = 0; i < n; i++) {
        cout << "Value " << i+1 << ": ";
        cin >> arr[i];
        sum += arr[i];
    }
    sort(arr, arr + n);
    cout << "Min=" << arr[0] << " Max=" << arr[n-1] << " Avg=" << sum/n << endl;
    return 0;
}
`,
    inputs: [
      { data: '7\n',   gap: 3000 },  // wait for g++ compile
      { data: '45\n',  gap: 500 },
      { data: '82\n',  gap: 500 },
      { data: '17\n',  gap: 500 },
      { data: '93\n',  gap: 500 },
      { data: '61\n',  gap: 500 },
      { data: '38\n',  gap: 500 },
      { data: '74\n',  gap: 500 },
    ],
    checks: [
      { desc: 'Min=17',  fn: o => o.includes('Min=17') },
      { desc: 'Max=93',  fn: o => o.includes('Max=93') },
      { desc: 'Avg=',    fn: o => o.includes('Avg=') },
    ],
    compileWait: 0,
    timeoutMs: 50000,
  },

  // ── 5. C: Temperature records 1+6=7 inputs ──────────────────────
  {
    name: 'C — Weekly Temperature (7 days = 7 inputs)',
    language: 'c',
    code: `
#include <stdio.h>
int main() {
    float temps[7];
    float sum = 0, max = -999, min = 999;
    char *days[] = {"Mon","Tue","Wed","Thu","Fri","Sat","Sun"};
    for (int i = 0; i < 7; i++) {
        printf("%s temp: ", days[i]);
        scanf("%f", &temps[i]);
        sum += temps[i];
        if (temps[i] > max) max = temps[i];
        if (temps[i] < min) min = temps[i];
    }
    printf("Weekly avg: %.1f C\\n", sum/7);
    printf("Hottest: %.1f C\\n", max);
    printf("Coolest: %.1f C\\n", min);
    return 0;
}
`,
    inputs: [
      { data: '32\n', gap: 3000 },  // wait for gcc compile
      { data: '35\n', gap: 500 },
      { data: '28\n', gap: 500 },
      { data: '40\n', gap: 500 },
      { data: '36\n', gap: 500 },
      { data: '29\n', gap: 500 },
      { data: '31\n', gap: 500 },
    ],
    checks: [
      { desc: 'Hottest = 40.0', fn: o => o.includes('Hottest: 40.0') || o.includes('Hottest: 40') },
      { desc: 'Coolest = 28.0', fn: o => o.includes('Coolest: 28.0') || o.includes('Coolest: 28') },
      { desc: 'Weekly avg present', fn: o => o.includes('Weekly avg:') },
    ],
    compileWait: 0,
    timeoutMs: 50000,
  },

(async () => {
  console.log('\n' + '╔' + '═'.repeat(60) + '╗');
  console.log('║   FINAL QA REPORT — All 5 Languages, Multiple Inputs   ║');
  console.log('╚' + '═'.repeat(60) + '╝');

  for (const t of TESTS) {
    await runTest(t);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n' + '╔' + '═'.repeat(60) + '╗');
  console.log('║                    FINAL SUMMARY                       ║');
  console.log('╚' + '═'.repeat(60) + '╝');
  console.log(`\n  Total PASSED: ${totalPassed}`);
  console.log(`  Total FAILED: ${totalFailed}`);
  console.log(`  Overall: ${totalFailed === 0 ? '✅ ALL PASS — PRODUCTION READY' : '❌ FAILURES DETECTED'}`);

  const failedTests = [...new Set(results.filter(r => r.status === 'FAIL').map(r => r.label))];
  if (failedTests.length > 0) {
    console.log('\n  Failed languages:');
    failedTests.forEach(l => console.log('    ❌ ' + l));
  }
})();
