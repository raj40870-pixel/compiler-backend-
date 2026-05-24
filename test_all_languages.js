const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0, skipped = 0;

const tests = [
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
      '}'
    ].join('\n'),
    inputs: ['100\n', '200\n'],
    delay: 500,
    expect: 'Add=300',
    timeout: 20000,
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
      '}'
    ].join('\n'),
    inputs: ['7\n', '8\n'],
    delay: 500,
    expect: 'Product=56',
    timeout: 20000,
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
      '}'
    ].join('\n'),
    inputs: ['10\n', '20\n', '30\n'],
    delay: 500,
    expect: 'Sum=60',
    timeout: 30000,
  },
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
    timeout: 10000,
  },
  {
    label: 'TypeScript — Simple Calculator (3 inputs)',
    lang: 'typescript',
    code: [
      "declare var require: any;",
      "declare var process: any;",
      "declare var console: any;",
      "const fs = require('fs');",
      "const input = fs.readFileSync(0, 'utf-8').trim().split('\\n');",
      "if(input.length >= 3) {",
      "  const a = parseInt(input[0]);",
      "  const op = input[1].trim();",
      "  const b = parseInt(input[2]);",
      "  if(op === '+') console.log('RES:' + (a+b));",
      "  else if(op === '-') console.log('RES:' + (a-b));",
      "}"
    ].join('\n'),
    inputs: ['50\n', '-\n', '15\n'],
    delay: 500,
    expect: 'RES:35',
    timeout: 15000,
  },
  {
    label: 'Go — Greeting (1 input)',
    lang: 'go',
    code: [
      'package main',
      'import (',
      '    "bufio"',
      '    "fmt"',
      '    "os"',
      ')',
      'func main() {',
      '    scanner := bufio.NewScanner(os.Stdin)',
      '    scanner.Scan()',
      '    fmt.Println("Hello Go:", scanner.Text())',
      '}'
    ].join('\n'),
    inputs: ['Antigravity\n'],
    delay: 500,
    expect: 'Hello Go: Antigravity',
    timeout: 15000,
  },
  {
    label: 'Rust — Echo (1 input)',
    lang: 'rust',
    code: [
      'use std::io;',
      'fn main() {',
      '    let mut input = String::new();',
      '    io::stdin().read_line(&mut input).unwrap();',
      '    println!("Rust says: {}", input.trim());',
      '}'
    ].join('\n'),
    inputs: ['Fast and Safe\n'],
    delay: 500,
    expect: 'Rust says: Fast and Safe',
    timeout: 20000,
  },
  {
    label: 'C# — Echo (1 input)',
    lang: 'csharp',
    code: [
      'using System;',
      'public class Program {',
      '    public static void Main() {',
      '        string s = Console.ReadLine();',
      '        Console.WriteLine("CSharp Echo: " + s);',
      '    }',
      '}'
    ].join('\n'),
    inputs: ['Dotnet core\n'],
    delay: 500,
    expect: 'CSharp Echo: Dotnet core',
    timeout: 20000,
  },
  {
    label: 'PHP — Echo (1 input)',
    lang: 'php',
    code: [
      '<?php',
      '$input = trim(fgets(STDIN));',
      'echo "PHP Echo: " . $input . "\\n";',
      '?>'
    ].join('\n'),
    inputs: ['Hypertext\n'],
    delay: 500,
    expect: 'PHP Echo: Hypertext',
    timeout: 15000,
  }
];

const results = [];

function runTest(t) {
  return new Promise(resolve => {
    const ws = new WebSocket('ws://localhost:8080/ws/run');
    let stdout = '', stderr = '', done = false;
    let idx = 0;

    const finish = () => {
      if (done) return;
      done = true;
      ws.close();

      const isNotInstalled = stderr.includes('is not installed');
      if (isNotInstalled) {
        console.log(`  ⏭️  SKIPPED: ${t.label} (Not Installed)`);
        skipped++;
        results.push({ lang: t.lang, label: t.label, status: 'SKIPPED', error: 'Compiler not installed' });
        resolve();
        return;
      }

      const hasExpected = stdout.includes(t.expect);
      const hasSysLog   = stdout.includes('[System]') ||
                          stdout.includes('Compiling/') ||
                          /Starting (interactive )?execution/i.test(stdout) ||
                          /Process exited/i.test(stdout);

      const ok = hasExpected && !hasSysLog;
      if (ok) {
        console.log(`  ✅ PASS: ${t.label}`);
        passed++;
        results.push({ lang: t.lang, label: t.label, status: 'PASS', error: null, output: stdout.trim() });
      } else {
        console.log(`  ❌ FAIL: ${t.label}`);
        let errStr = '';
        if (!hasExpected) errStr += `Expected "${t.expect}" in stdout. `;
        if (hasSysLog)    errStr += `System log found in output. `;
        if (stderr.trim()) errStr += `STDERR: ${stderr.trim().slice(0, 100)}`;
        
        console.log(`       => ${errStr}`);
        failed++;
        results.push({ lang: t.lang, label: t.label, status: 'FAIL', error: errStr, output: stdout.trim() });
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
      results.push({ lang: t.lang, label: t.label, status: 'FAIL', error: 'WS Error: ' + err.message });
      resolve();
    });
    setTimeout(() => {
      if (!done) {
        console.log(`  ⚠️  TIMEOUT: ${t.label}`);
        failed++;
        results.push({ lang: t.lang, label: t.label, status: 'FAIL', error: 'Timeout after ' + (t.timeout/1000) + 's' });
        finish();
      }
    }, t.timeout);
  });
}

(async () => {
  console.log('\\n╔════════════════════════════════════════════════╗');
  console.log('║   FINAL QA — 10 Languages Extensive Test        ║');
  console.log('╚════════════════════════════════════════════════╝\\n');

  for (const t of tests) {
    await runTest(t);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\\n╔════════════════════════════════════════════════╗');
  console.log(`║  TOTAL: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED           ║`);
  console.log('╚════════════════════════════════════════════════╝');

  // Generate Markdown report
  let md = '# Multiple Scenarios Execution Report (100% Accurate STDIN)\n\n';
  md += `**Summary:**\n- **Passed:** ${passed}\n- **Failed:** ${failed}\n- **Skipped (Not Installed):** ${skipped}\n\n`;
  
  md += '| Language | Scenario | Status | Details |\n';
  md += '|---|---|---|---|\n';
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : (r.status === 'SKIPPED' ? '⏭️' : '❌');
    md += `| **${r.lang}** | ${r.label} | ${icon} ${r.status} | ${r.error || 'Output verified successfully'} |\n`;
  }

  const reportPath = path.join(__dirname, '..', '..', 'COMPILER_TEST_REPORT.md');
  fs.writeFileSync(reportPath, md);
  console.log('\\nReport saved to: ' + reportPath);
  process.exit(failed > 0 ? 1 : 0);
})();
