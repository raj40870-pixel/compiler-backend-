"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const URL = 'ws://localhost:8080/ws/run';
const testCases = [
    {
        lang: 'python',
        code: 's = input()\nprint("ECHO: " + s)',
        input: 'hello python',
        expectedOutput: 'ECHO: hello python',
        iterations: 100
    },
    {
        lang: 'javascript',
        code: 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\nconsole.log("ECHO: " + input);',
        input: 'hello js',
        expectedOutput: 'ECHO: hello js',
        iterations: 100
    },
    {
        lang: 'java',
        code: 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner s = new Scanner(System.in);\n        System.out.println("ECHO: " + s.nextLine());\n    }\n}',
        input: 'hello java',
        expectedOutput: 'ECHO: hello java',
        iterations: 100
    },
    {
        lang: 'c',
        code: '#include <stdio.h>\nint main() {\n    char str[100];\n    scanf("%[^\\n]", str);\n    printf("ECHO: %s\\n", str);\n    return 0;\n}',
        input: 'hello c',
        expectedOutput: 'ECHO: hello c',
        iterations: 5
    },
    {
        lang: 'cpp',
        code: '#include <iostream>\n#include <string>\nusing namespace std;\nint main() {\n    string str;\n    getline(cin, str);\n    cout << "ECHO: " << str << endl;\n    return 0;\n}',
        input: 'hello cpp',
        expectedOutput: 'ECHO: hello cpp',
        iterations: 5
    },
    {
        lang: 'csharp',
        code: 'using System;\npublic class Program {\n    public static void Main() {\n        string s = Console.ReadLine();\n        Console.WriteLine("ECHO: " + s);\n    }\n}',
        input: 'hello csharp',
        expectedOutput: 'ECHO: hello csharp',
        iterations: 5
    },
    {
        lang: 'go',
        code: 'package main\nimport (\n    "bufio"\n    "fmt"\n    "os"\n)\nfunc main() {\n    scanner := bufio.NewScanner(os.Stdin)\n    scanner.Scan()\n    fmt.Println("ECHO: " + scanner.Text())\n}',
        input: 'hello go',
        expectedOutput: 'ECHO: hello go',
        iterations: 5
    },
    {
        lang: 'php',
        code: '<?php\n$input = trim(fgets(STDIN));\necho "ECHO: " . $input . "\\n";\n?>',
        input: 'hello php',
        expectedOutput: 'ECHO: hello php',
        iterations: 5
    },
    {
        lang: 'rust',
        code: 'use std::io;\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_line(&mut input).unwrap();\n    println!("ECHO: {}", input.trim());\n}',
        input: 'hello rust',
        expectedOutput: 'ECHO: hello rust',
        iterations: 5
    },
];
async function runTest(testCase, iterCount) {
    return new Promise((resolve) => {
        const start = Date.now();
        const ws = new ws_1.default(URL);
        let output = '';
        const timeout = setTimeout(() => {
            ws.close();
            resolve({ success: false, time: Date.now() - start, output: output + '\nTIMEOUT' });
        }, 45000);
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'run', language: testCase.lang, code: testCase.code }));
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'stdin', data: testCase.input + '\n' }));
            }, 500);
        });
        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.type === 'stdout' || msg.type === 'stderr') {
                output += msg.data;
            }
            else if (msg.type === 'exit') {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    success: output.includes(testCase.expectedOutput),
                    time: Date.now() - start,
                    output
                });
            }
        });
        ws.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ success: false, time: Date.now() - start, output: 'WS Error: ' + err.message });
        });
    });
}
async function main() {
    console.log("Starting Stress Test...");
    const results = [];
    for (const tc of testCases) {
        console.log(`Testing ${tc.lang} (${tc.iterations} iterations)...`);
        let passed = 0;
        let failed = 0;
        let totalTime = 0;
        let lastError = '';
        for (let i = 1; i <= tc.iterations; i++) {
            process.stdout.write(`\rIteration ${i}/${tc.iterations}`);
            const res = await runTest(tc, i);
            totalTime += res.time;
            if (res.success) {
                passed++;
            }
            else {
                failed++;
                lastError = res.output;
            }
            await new Promise(r => setTimeout(r, 1500)); // Sleep to prevent hammering Judge0
        }
        console.log(`\n  => Passed: ${passed}, Failed: ${failed}, AvgTime: ${(totalTime / tc.iterations).toFixed(0)}ms`);
        results.push({
            lang: tc.lang,
            passed,
            failed,
            avgTime: Math.round(totalTime / tc.iterations),
            lastError
        });
    }
    let md = '# Multi-Language Stress Test & STDIN Accuracy Report\n\n';
    md += '| Language | Iterations | Passed | Failed | Avg Time | Status |\n';
    md += '|---|---|---|---|---|---|\n';
    for (const r of results) {
        const status = r.failed === 0 ? '✅ SUCCESS' : (r.passed > 0 ? '⚠️ UNSTABLE' : '❌ FAILED');
        md += `| **${r.lang}** | ${r.passed + r.failed} | ${r.passed} | ${r.failed} | ${r.avgTime}ms | ${status} |\n`;
    }
    md += '\n## Error Log\n';
    for (const r of results) {
        if (r.failed > 0) {
            md += `\n### ${r.lang}\n\`\`\`\n${r.lastError}\n\`\`\`\n`;
        }
    }
    fs.writeFileSync(path.join(__dirname, '..', '..', '..', 'TEST_RESULTS.md'), md);
    console.log("Report written to TEST_RESULTS.md");
}
main();
//# sourceMappingURL=stressTest.js.map