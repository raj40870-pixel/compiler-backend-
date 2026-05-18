const WebSocket = require('ws');
const PASS = (msg) => console.log(`  ✅ PASS: ${msg}`);
const FAIL = (msg) => console.log(`  ❌ FAIL: ${msg}`);
const LOG  = (msg) => console.log(`  📝 ${msg}`);

// C with 6 inputs - timeout bumped to 35s, first input delayed 5s for compilation
const test = {
  name: 'C — Score Finder 6 students (stress 6 inputs after compile)',
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
    { data: '6\n',  delay: 5000 },   // wait 5s for compilation
    { data: '78\n', delay: 600 },
    { data: '92\n', delay: 600 },
    { data: '55\n', delay: 600 },
    { data: '88\n', delay: 600 },
    { data: '67\n', delay: 600 },
    { data: '95\n', delay: 600 },
  ],
  checks: [
    { desc: 'Max = 95.0', fn: o => o.includes('Max: 95.0') },
    { desc: 'Min = 55.0', fn: o => o.includes('Min: 55.0') },
    { desc: 'Avg = 79.17',fn: o => o.includes('Avg: 79.17') },
  ],
  timeoutMs: 35000,
};

function runTest(t) {
  return new Promise((resolve) => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TEST: ${t.name}`);
    const ws = new WebSocket('ws://localhost:8080/ws/run');
    const messages = [];
    let stdoutAcc = '', stderrAcc = '';
    let done = false;
    let idx = 0;

    const finish = () => {
      if (done) return; done = true; ws.close();
      const sysMsgs = messages.filter(m => m.type === 'system');
      if (sysMsgs.length === 0) PASS('Zero system messages');
      else FAIL('System messages: ' + JSON.stringify(sysMsgs));
      t.checks.forEach(({desc, fn}) => {
        if (fn(stdoutAcc)) PASS(desc);
        else FAIL(desc + ' | out=' + JSON.stringify(stdoutAcc.trim()));
      });
      LOG('stdout: ' + JSON.stringify(stdoutAcc.trim()));
      if (stderrAcc.trim()) LOG('stderr: ' + stderrAcc.trim());
      resolve();
    };

    const sendNext = () => {
      if (idx >= t.inputs.length) return;
      const inp = t.inputs[idx++];
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          LOG(`stdin[${idx}]: ${JSON.stringify(inp.data)}`);
          ws.send(JSON.stringify({ type: 'stdin', data: inp.data }));
          sendNext();
        }
      }, inp.delay || 600);
    };

    ws.on('open', () => { ws.send(JSON.stringify({ type:'run', language:t.language, code:t.code })); sendNext(); });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      messages.push(m);
      if (m.type === 'stdout') stdoutAcc += m.data;
      if (m.type === 'stderr') stderrAcc += m.data;
      if (m.type === 'exit') finish();
    });
    ws.on('error', err => { FAIL('WS: '+err.message); finish(); });
    setTimeout(() => { FAIL('TIMEOUT after ' + t.timeoutMs + 'ms'); finish(); }, t.timeoutMs);
  });
}

(async () => {
  console.log('\n═══ C Stress Test with 6 inputs (5s compile wait) ═══');
  await runTest(test);
  console.log('\n═══ DONE ═══');
})();
