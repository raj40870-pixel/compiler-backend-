const WebSocket = require('ws');

const tests = [
  {
    lang: 'go',
    code: `package main
import "fmt"
func main() {
    var name string
    fmt.Scanln(&name)
    fmt.Printf("Hello, %s!\\n", name)
}`,
    input: "GoCloud\n",
    expect: "Hello, GoCloud!"
  },
  {
    lang: 'rust',
    code: `fn main() {
    println!("Hello from Rust!");
}`,
    input: "",
    expect: "Hello from Rust!"
  },
  {
    lang: 'php',
    code: `<?php
echo "PHP version: " . phpversion() . "\\n";
`,
    input: "",
    expect: "PHP version"
  },
  {
    lang: 'csharp',
    code: `using System;
public class Program {
    public static void Main() {
        Console.WriteLine("C# Mono works!");
    }
}`,
    input: "",
    expect: "C# Mono works!"
  }
];

function runTest(t) {
  return new Promise((resolve) => {
    console.log(`Running ${t.lang.toUpperCase()} cloud test...`);
    const ws = new WebSocket('ws://localhost:8080/ws/run');
    let stdout = '';
    let stderr = '';
    let done = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'run', language: t.lang, code: t.code }));
      
      if (t.input) {
        // Send input shortly after starting the run
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log(`[STDIN] Sending input for ${t.lang.toUpperCase()}`);
            ws.send(JSON.stringify({ type: 'stdin', data: t.input }));
          }
        }, 1000);
      }
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'stdout') stdout += msg.data;
      if (msg.type === 'stderr') stderr += msg.data;
      if (msg.type === 'exit') {
        done = true;
        ws.close();
        
        console.log(`--- Result for ${t.lang.toUpperCase()} ---`);
        console.log('stdout:', JSON.stringify(stdout.trim()));
        if (stderr.trim()) console.log('stderr:', stderr.trim());
        
        if (stdout.includes(t.expect)) {
          console.log(`✅ PASS: ${t.lang.toUpperCase()}`);
        } else {
          console.log(`❌ FAIL: ${t.lang.toUpperCase()} (Expected "${t.expect}")`);
        }
        resolve();
      }
    });

    ws.on('error', (err) => {
      console.log(`❌ FAIL: ${t.lang.toUpperCase()} (WS Error: ${err.message})`);
      resolve();
    });

    setTimeout(() => {
      if (!done) {
        console.log(`⚠️ TIMEOUT: ${t.lang.toUpperCase()} timed out!`);
        ws.close();
        resolve();
      }
    }, 25000);
  });
}

(async () => {
  for (const t of tests) {
    await runTest(t);
    console.log('');
  }
})();
