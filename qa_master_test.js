/**
 * QA Master Test — One Shape Compiler
 * Tests 5 cases per language via WebSocket streaming
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8080/ws/run';
const TIMEOUT_MS = 20000;

// ─── Test Cases ────────────────────────────────────────────────────────────────

const TEST_CASES = {
  c: [
    {
      name: 'T1: Basic I/O',
      code: `#include <stdio.h>\nint main() { printf("Compiler OK\\n"); return 0; }`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `#include <stdio.h>\nint main() { printf("%d\\n", 15 + 27 * 2 - 10 / 5); return 0; }`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `#include <stdio.h>\nint main() { for(int i=1;i<=5;i++) printf("%d\\n",i); return 0; }`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `#include <stdio.h>\nint main() { int n; printf("Enter number: "); scanf("%d",&n); printf("You entered: %d\\n",n); return 0; }`,
      stdin: '42\n',
      expect: (out) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `#include <stdio.h>\nint main() { prnt("hello"); return 0; }`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt'),
      expectedStr: 'Compiler error message',
    },
  ],

  cpp: [
    {
      name: 'T1: Basic I/O',
      code: `#include <iostream>\nusing namespace std;\nint main() { cout << "Compiler OK" << endl; return 0; }`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `#include <iostream>\nusing namespace std;\nint main() { cout << (15 + 27 * 2 - 10 / 5) << endl; return 0; }`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `#include <iostream>\nusing namespace std;\nint main() { for(int i=1;i<=5;i++) cout<<i<<endl; return 0; }`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `#include <iostream>\nusing namespace std;\nint main() { int n; cout<<"Enter number: "; cin>>n; cout<<"You entered: "<<n<<endl; return 0; }`,
      stdin: '42\n',
      expect: (out, err) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `#include <iostream>\nusing namespace std;\nint main() { prnt("hello"); return 0; }`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt'),
      expectedStr: 'Compiler error message',
    },
  ],

  java: [
    {
      name: 'T1: Basic I/O',
      code: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Compiler OK");\n  }\n}`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `public class Main {\n  public static void main(String[] args) {\n    System.out.println(15 + 27 * 2 - 10 / 5);\n  }\n}`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `public class Main {\n  public static void main(String[] args) {\n    for(int i=1;i<=5;i++) System.out.println(i);\n  }\n}`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    System.out.print("Enter number: ");\n    int n = sc.nextInt();\n    System.out.println("You entered: " + n);\n  }\n}`,
      stdin: '42\n',
      expect: (out, err) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `public class Main {\n  public static void main(String[] args) {\n    prnt("hello");\n  }\n}`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt'),
      expectedStr: 'Compiler error message',
    },
  ],

  python: [
    {
      name: 'T1: Basic I/O',
      code: `print("Compiler OK")`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `print(15 + 27 * 2 - 10 // 5)`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `for i in range(1, 6):\n    print(i)`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `n = input("Enter number: ")\nprint("You entered: " + n)`,
      stdin: '42\n',
      expect: (out, err) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `prnt("hello")`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt') || (out + err).includes('not defined'),
      expectedStr: 'NameError or similar',
    },
  ],

  javascript: [
    {
      name: 'T1: Basic I/O',
      code: `console.log("Compiler OK");`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `console.log(15 + 27 * 2 - 10 / 5);`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `for(let i=1;i<=5;i++) console.log(i);`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `process.stdout.write('Enter number: ');
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.once('data', (data) => {
  const n = data.trim();
  console.log('You entered: ' + n);
  process.exit(0);
});`,
      stdin: '42\n',
      expect: (out, err) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `prnt("hello");`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt') || (out + err).includes('not defined'),
      expectedStr: 'ReferenceError or similar',
    },
  ],

  go: [
    {
      name: 'T1: Basic I/O',
      code: `package main\nimport "fmt"\nfunc main() { fmt.Println("Compiler OK") }`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `package main\nimport "fmt"\nfunc main() { fmt.Println(15 + 27 * 2 - 10 / 5) }`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `package main\nimport "fmt"\nfunc main() { for i:=1;i<=5;i++ { fmt.Println(i) } }`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `package main\nimport "fmt"\nfunc main() {\n  var n int\n  fmt.Print("Enter number: ")\n  fmt.Scan(&n)\n  fmt.Printf("You entered: %d\\n", n)\n}`,
      stdin: '42\n',
      expect: (out, err) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `package main\nimport "fmt"\nfunc main() { prnt("hello") }`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt') || (out + err).includes('undefined'),
      expectedStr: 'Compile error message',
    },
  ],

  php: [
    {
      name: 'T1: Basic I/O',
      code: `<?php\necho "Compiler OK\\n";`,
      stdin: '',
      expect: (out) => out.trim() === 'Compiler OK',
      expectedStr: 'Compiler OK',
    },
    {
      name: 'T2: Arithmetic (BODMAS)',
      code: `<?php\necho (15 + 27 * 2 - 10 / 5) . "\\n";`,
      stdin: '',
      expect: (out) => out.trim() === '67',
      expectedStr: '67',
    },
    {
      name: 'T3: Loops 1-5',
      code: `<?php\nfor($i=1;$i<=5;$i++) echo $i . "\\n";`,
      stdin: '',
      expect: (out) => out.trim() === '1\n2\n3\n4\n5',
      expectedStr: '1\\n2\\n3\\n4\\n5',
    },
    {
      name: 'T4: User Input',
      code: `<?php\necho "Enter number: ";\n$n = trim(fgets(STDIN));\necho "You entered: " . $n . "\\n";`,
      stdin: '42\n',
      expect: (out, err) => out.includes('Enter number:') && out.includes('You entered: 42'),
      expectedStr: 'Enter number: ... You entered: 42',
    },
    {
      name: 'T5: Syntax Error',
      code: `<?php\nprnt("hello");`,
      stdin: '',
      expect: (out, err) => (out + err).toLowerCase().includes('error') || (out + err).includes('prnt') || (out + err).includes('undefined'),
      expectedStr: 'Fatal error or similar',
    },
  ],
};

// ─── WS Runner ────────────────────────────────────────────────────────────────

function runTest(language, testCase) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let done = false;

    const ws = new WebSocket(WS_URL);

    const timer = setTimeout(() => {
      timedOut = true;
      ws.close();
      if (!done) {
        done = true;
        resolve({ pass: false, stdout, stderr, reason: 'TIMEOUT (20s)' });
      }
    }, TIMEOUT_MS);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language, code: testCase.code }));
      if (testCase.stdin) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stdin', data: testCase.stdin }));
          }
        }, 800);
      }
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'stdout') stdout += msg.data;
      if (msg.type === 'stderr') stderr += msg.data;
      if (msg.type === 'exit') {
        clearTimeout(timer);
        ws.close();
        if (!done) {
          done = true;
          // Strip ANSI codes
          const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
          const cleanOut = clean(stdout);
          const cleanErr = clean(stderr);
          let pass = false;
          let reason = '';
          try {
            pass = testCase.expect(cleanOut, cleanErr);
          } catch(e) {
            reason = 'Expect function threw: ' + e.message;
          }
          if (!pass && !reason) {
            reason = `Got stdout: ${JSON.stringify(cleanOut.substring(0,200))}  stderr: ${JSON.stringify(cleanErr.substring(0,200))}`;
          }
          resolve({ pass, stdout: cleanOut, stderr: cleanErr, reason });
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        resolve({ pass: false, stdout, stderr, reason: 'WS ERROR: ' + err.message });
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        resolve({ pass: false, stdout, stderr, reason: timedOut ? 'TIMEOUT' : 'WS closed unexpectedly' });
      }
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const languages = Object.keys(TEST_CASES);
  const results = {};

  console.log('\n════════════════════════════════════════════════════════');
  console.log('   ONE SHAPE COMPILER — QA MASTER TEST');
  console.log('════════════════════════════════════════════════════════\n');

  for (const lang of languages) {
    console.log(`\n─────────────────────────────────`);
    console.log(`  LANGUAGE: ${lang.toUpperCase()}`);
    console.log(`─────────────────────────────────`);
    results[lang] = [];

    const cases = TEST_CASES[lang];
    for (const tc of cases) {
      process.stdout.write(`  ${tc.name} ... `);
      const result = await runTest(lang, tc);
      const status = result.pass ? '✅ PASS' : '❌ FAIL';
      console.log(status);
      if (!result.pass) {
        console.log(`     Expected: ${tc.expectedStr}`);
        console.log(`     Reason  : ${result.reason}`);
      }
      results[lang].push({ name: tc.name, ...result });
      // Small delay between tests
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // ─── Summary Table ──────────────────────────────────────────────────────────

  console.log('\n\n════════════════════════════════════════════════════════════════════════════════');
  console.log('  FINAL QA REPORT');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  const header = '| Language   | T1: I/O | T2: Math | T3: Loop | T4: Input | T5: Error | FINAL STATUS |';
  const sep    = '|------------|---------|----------|----------|-----------|-----------|--------------|';
  console.log(header);
  console.log(sep);

  for (const lang of languages) {
    const r = results[lang];
    const cell = (i) => r[i]?.pass ? '  ✅ PASS' : '  ❌ FAIL';
    const allPass = r.every(x => x.pass);
    const failed = r.filter(x => !x.pass).map(x => x.name.split(':')[0].trim());
    const status = allPass ? '✅ READY     ' : `❌ BUGS: ${failed.join(', ')}`;
    const langPad = lang.padEnd(10);
    console.log(`| ${langPad} |${cell(0)}  |${cell(1)}   |${cell(2)}   |${cell(3)}    |${cell(4)}    | ${status}|`);
  }

  console.log('\n════════════════════════════════════════════════════════════════════════════════\n');

  // ─── Detailed Failures ───────────────────────────────────────────────────────
  let hasFailures = false;
  for (const lang of languages) {
    const fails = results[lang].filter(x => !x.pass);
    if (fails.length > 0) {
      if (!hasFailures) {
        hasFailures = true;
        console.log('FAILURE DETAILS:\n');
      }
      for (const f of fails) {
        console.log(`  [${lang.toUpperCase()}] ${f.name}`);
        console.log(`    Reason : ${f.reason}`);
        console.log('');
      }
    }
  }
  if (!hasFailures) console.log('  All tests passed! 🎉\n');
}

main().catch(console.error);
