const WebSocket = require('ws');

const tests = [
  {
    name: 'Python print (no input)',
    language: 'python',
    code: 'print("Hello World")',
    inputs: [],
    expect: 'Hello World'
  },
  {
    name: 'Python with stdin',
    language: 'python',
    code: 'name = input("Enter name: ")\nprint(f"Hello {name}!")',
    inputs: [{ delay: 1500, data: 'PythonDev\n' }],
    expect: 'Hello PythonDev!'
  },
  {
    name: 'JavaScript print (no input)',
    language: 'javascript',
    code: 'console.log("Hello World");',
    inputs: [],
    expect: 'Hello World'
  }
];

let currentTest = 0;

function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n--- Running: ${test.name} ---`);
    const ws = new WebSocket('ws://localhost:8080/ws/run');
    const messages = [];
    let stdoutAcc = '';

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language: test.language, code: test.code }));
      test.inputs.forEach(inp => {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stdin', data: inp.data }));
          }
        }, inp.delay);
      });
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      messages.push(msg);
      if (msg.type === 'stdout') stdoutAcc += msg.data;
      if (msg.type === 'exit') {
        ws.close();
        const systemMsgs = messages.filter(m => m.type === 'system');
        const output = stdoutAcc.trim();
        const hasExpected = output.includes(test.expect);

        if (systemMsgs.length > 0) {
          console.log(`FAIL [${test.name}]: System messages found: ${JSON.stringify(systemMsgs)}`);
        } else {
          console.log(`PASS [${test.name}]: Zero system messages`);
        }
        if (hasExpected) {
          console.log(`PASS [${test.name}]: Output contains "${test.expect}"`);
        } else {
          console.log(`FAIL [${test.name}]: Output was: ${JSON.stringify(output)}`);
        }
        resolve();
      }
    });

    ws.on('error', (err) => { console.error('WS error:', err.message); resolve(); });
    setTimeout(() => { ws.close(); console.log(`TIMEOUT: ${test.name}`); resolve(); }, 12000);
  });
}

(async () => {
  for (const test of tests) {
    await runTest(test);
  }
  console.log('\n=== All tests done ===');
})();
