const WebSocket = require('ws');
let passed = 0, failed = 0;

const tests = [
  {
    label: 'JavaScript — Hotel Bill (5 inputs)',
    lang: 'javascript',
    code: [
      "const readline = require('readline');",
      "const rl = readline.createInterface({ input: process.stdin, output: process.stdout });",
      "const ask = q => new Promise(r => rl.question(q, r));",
      "(async () => {",
      "  const g  = await ask('Guest: ');",
      "  const ni = parseInt(await ask('Nights: '));",
      "  const ra = parseFloat(await ask('Rate: '));",
      "  const me = parseInt(await ask('Meals: '));",
      "  const mr = parseFloat(await ask('MealR: '));",
      "  rl.close();",
      "  console.log('TOTAL:' + (ni * ra + me * mr).toFixed(2));",
      "})();"
    ].join('\n'),
    inputs: ['Raj\n', '3\n', '2000\n', '5\n', '200\n'],
    delay: 500,
    expect: 'TOTAL:7000.00',
    timeout: 12000,
  },
  {
    label: 'Python — Student Report (4 inputs)',
    lang: 'python',
    code: [
      "n = input('Name: ')",
      "a = int(input('Math: '))",
      "b = int(input('Sci: '))",
      "c = int(input('Eng: '))",
      "avg = (a+b+c)/3",
      "print(f'Student: {n}, Avg: {avg:.1f}')",
    ].join('\n'),
    inputs: ['Priya\n', '90\n', '85\n', '95\n'],
    delay: 500,
    expect: 'Avg: 90.0',
    timeout: 10000,
  },
  {
    label: 'Java — Three-Number Sum (3 inputs)',
    lang: 'java',
    code: [
      'import java.util.Scanner;',
      'public class Main {',
      '  public static void main(String[] args) {',
      '    Scanner sc = new Scanner(System.in);',
      '    int x = sc.nextInt();',
      '    int y = sc.nextInt();',
      '    int z = sc.nextInt();',
      '    System.out.println("Sum=" + (x + y + z));',
      '  }',
      '}',
    ].join('\n'),
    inputs: ['10\n', '20\n', '30\n'],
    delay: 500,
    expect: 'Sum=60',
    timeout: 35000,
  },
  {
    label: 'C++ — Multiply Two Numbers (2 inputs)',
    lang: 'cpp',
    code: [
      '#include <iostream>',
      'using namespace std;',
      'int main() {',
      '  int a, b;',
      '  cin >> a >> b;',
      '  cout << "Product=" << a*b << endl;',
      '  return 0;',
      '}',
    ].join('\n'),
    inputs: ['7\n', '8\n'],
    delay: 500,
    expect: 'Product=56',
    timeout: 25000,
  },
  {
    label: 'C — Add Two Numbers (2 inputs)',
    lang: 'c',
    code: [
      '#include <stdio.h>',
      'int main() {',
      '  int a, b;',
      '  scanf("%d %d", &a, &b);',
      '  printf("Add=%d\\n", a + b);',
      '  return 0;',
      '}',
    ].join('\n'),
    inputs: ['100\n', '200\n'],
    delay: 500,
    expect: 'Add=300',
    timeout: 25000,
  },
];

function runTest(t) {
  return new Promise(resolve => {
    const ws = new WebSocket('ws://localhost:8080/ws/run');
    let stdout = '', stderr = '', done = false;
    let idx = 0;

    const finish = () => {
      if (done) return;
      done = true;
      ws.close();

      const hasExpected = stdout.includes(t.expect);
      const hasSysLog   = stdout.includes('[System]') ||
                          stdout.includes('Compiling/') ||
                          /Starting (interactive )?execution/i.test(stdout) ||
                          /Process exited/i.test(stdout);

      const ok = hasExpected && !hasSysLog;
      if (ok) {
        console.log(`  ✅ PASS: ${t.label}`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: ${t.label}`);
        if (!hasExpected) console.log(`       Expected "${t.expect}" in stdout`);
        if (hasSysLog)    console.log(`       System log found in output!`);
        console.log(`       stdout: ${JSON.stringify(stdout.trim().slice(-150))}`);
        if (stderr.trim()) console.log(`       stderr: ${stderr.trim().slice(0, 100)}`);
        failed++;
      }
      resolve();
    };

    const sendNext = () => {
      if (idx >= t.inputs.length) return;
      const data = t.inputs[idx++];
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stdin', data }));
          sendNext();
        }
      }, t.delay);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language: t.lang, code: t.code }));
      sendNext();
    });
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'stdout') stdout += m.data;
      if (m.type === 'stderr') stderr += m.data;
      if (m.type === 'exit') finish();
    });
    ws.on('error', err => {
      console.log(`  ❌ FAIL: ${t.label} | WS error: ${err.message}`);
      failed++;
      resolve();
    });
    setTimeout(() => {
      if (!done) {
        console.log(`  ⚠️  TIMEOUT: ${t.label} | stdout so far: ${JSON.stringify(stdout.trim().slice(-80))}`);
        finish();
      }
    }, t.timeout);
  });
}

(async () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   FINAL QA — All 5 Languages Self-Test        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  for (const t of tests) {
    await runTest(t);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log(`║  TOTAL: ${passed} PASSED, ${failed} FAILED${' '.repeat(27 - String(passed + failed).length)}║`);
  console.log('╚════════════════════════════════════════════════╝');
  if (failed === 0) {
    console.log('\n🏆 ALL 5 LANGUAGES PASS — PRODUCTION READY 🏆');
  }
})();
