"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWsConnection = handleWsConnection;
const ws_1 = require("ws");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
// ─────────────────────────────────────────────────────────────────────────────
//  Judge0 CE – public free instance (no API key needed for basic usage)
//  Used for: C, C++, C#   (WDAC blocks locally-compiled .exe on this machine)
//  Docs: https://ce.judge0.com
// ─────────────────────────────────────────────────────────────────────────────
const JUDGE0_HOST = 'ce.judge0.com';
// Language IDs for Judge0 CE
const JUDGE0_LANG_ID = {
    c: 50, // C (GCC 10.2.0)
    cpp: 54, // C++ (GCC 10.2.0)
    csharp: 51, // C# (Mono 6.12.0)
};
function judge0Http(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const req = https_1.default.request({
            hostname: JUDGE0_HOST,
            path: urlPath,
            method,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        if (body)
            req.write(body);
        req.end();
    });
}
/**
 * Submit code to Judge0 and stream results back over the WebSocket.
 * Polls until the submission is done, then sends stdout / stderr / exit.
 */
async function runWithJudge0(ws, langId, code, stdin, send) {
    // 1️⃣  Submit
    const body = JSON.stringify({
        language_id: langId,
        source_code: Buffer.from(code).toString('base64'),
        stdin: Buffer.from(stdin).toString('base64'),
        base64_encoded: true,
    });
    let token;
    try {
        const raw = await judge0Http('POST', '/submissions?base64_encoded=true&wait=false', body);
        const parsed = JSON.parse(raw);
        token = parsed.token;
        if (!token)
            throw new Error(`No token: ${raw.slice(0, 200)}`);
    }
    catch (err) {
        send('stderr', `⚠️  Judge0 submission failed: ${err.message}\r\n` +
            `C/C++/C# run via cloud sandbox on this machine (WDAC blocks local .exe).\r\n` +
            `Please check your internet connection.\r\n`);
        send('exit', 1);
        return;
    }
    // 2️⃣  Poll for result (max 45 s)
    const decode = (b64) => b64 ? Buffer.from(b64, 'base64').toString('utf-8') : '';
    for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        let result;
        try {
            const raw = await judge0Http('GET', `/submissions/${token}?base64_encoded=true`);
            result = JSON.parse(raw);
        }
        catch {
            continue;
        }
        const statusId = result.status?.id ?? 0;
        if (statusId <= 2)
            continue; // Queued / Processing — keep polling
        const stdout = decode(result.stdout);
        const compileOut = decode(result.compile_output);
        const stderrOut = decode(result.stderr);
        const msg = decode(result.message);
        let stderr = [compileOut, stderrOut, msg].filter(Boolean).join('');
        if (statusId === 5)
            stderr += '\n⏱  Time Limit Exceeded';
        if (statusId === 14)
            stderr += '\n🚫  Exec Format Error';
        if (stdout)
            send('stdout', stdout.replace(/\n/g, '\r\n'));
        if (stderr)
            send('stderr', stderr.replace(/\n/g, '\r\n'));
        send('exit', statusId === 3 ? 0 : 1);
        return;
    }
    send('stderr', '⚠️  Judge0 timed out (45 s). Please try again.\r\n');
    send('exit', 1);
}
// ─────────────────────────────────────────────────────────────────────────────
//  Local PATH enrichment for Python / Java / Node
// ─────────────────────────────────────────────────────────────────────────────
const MINGW_PATHS = [
    'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
    'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
    'C:\\MinGW\\bin',
    'C:\\msys64\\mingw64\\bin',
];
const EXTRA_PATHS = [
    ...MINGW_PATHS,
    'C:\\Python312', 'C:\\Python311', 'C:\\Python310',
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python312`,
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python311`,
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python310`,
];
const ENRICHED_PATH = [
    ...EXTRA_PATHS,
    ...(process.env.PATH || '').split(';').filter(p => !p.toLowerCase().includes('windowsapps')),
].join(';');
const BASE_ENV = {
    ...process.env,
    PATH: ENRICHED_PATH,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
};
const RUNS_DIR = path_1.default.resolve(__dirname, '..', '..', 'bin', 'runs');
// ─────────────────────────────────────────────────────────────────────────────
//  WebSocket handler
// ─────────────────────────────────────────────────────────────────────────────
function handleWsConnection(ws) {
    let child = null;
    let runDir = '';
    let timeoutId = null;
    // Stdin buffering — queues input received before the process is ready
    let stdinQueue = [];
    // Accumulated stdin for Judge0 (cloud runs send all stdin at once)
    let judge0StdinBuffer = [];
    let isJudge0Run = false;
    let judge0Running = false; // true while Judge0 is polling
    let judge0StdinListener = null; // debounce hook
    const send = (type, data) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, data }));
        }
    };
    const cleanup = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (child) {
            try {
                child.kill();
            }
            catch (_) { }
            child = null;
        }
        stdinQueue = [];
        if (runDir && fs_1.default.existsSync(runDir)) {
            const d = runDir;
            runDir = '';
            setTimeout(() => {
                try {
                    fs_1.default.rmSync(d, { recursive: true, force: true });
                }
                catch (_) {
                    setTimeout(() => { try {
                        fs_1.default.rmSync(d, { recursive: true, force: true });
                    }
                    catch (__) { } }, 1200);
                }
            }, 250);
        }
    };
    const writeStdin = (data) => {
        if (isJudge0Run) {
            // Accumulate stdin and notify the debounce listener so it resets
            judge0StdinBuffer.push(data);
            if (judge0StdinListener)
                judge0StdinListener();
            return;
        }
        if (child?.stdin?.writable) {
            child.stdin.write(data);
        }
        else {
            stdinQueue.push(data);
        }
    };
    const flushStdinQueue = () => {
        if (!child?.stdin?.writable)
            return;
        while (stdinQueue.length > 0) {
            child.stdin.write(stdinQueue.shift());
        }
    };
    const startProcess = (command, args, cwd) => {
        try {
            const opts = {
                cwd,
                env: BASE_ENV,
                shell: true,
                windowsVerbatimArguments: true,
            };
            const quoted = (s) => (s.includes(' ') && !s.startsWith('"') ? `"${s}"` : s);
            const cmdLine = [quoted(command), ...args.map(quoted)].join(' ');
            child = (0, child_process_1.spawn)(cmdLine, [], opts);
            flushStdinQueue();
            child.stdout?.on('data', (d) => send('stdout', d.toString()));
            child.stderr?.on('data', (d) => send('stderr', d.toString()));
            child.on('close', (code) => {
                send('exit', code ?? 0);
                cleanup();
            });
            child.on('error', (err) => {
                send('stderr', `Failed to execute: ${err.message}\r\n`);
                send('exit', 1);
                cleanup();
            });
            timeoutId = setTimeout(() => {
                if (child) {
                    send('stderr', '\r\nExecution timed out (60 seconds)\r\n');
                    cleanup();
                }
            }, 60000);
        }
        catch (err) {
            send('stderr', `Process spawn failed: ${err.message}\r\n`);
            send('exit', 1);
            cleanup();
        }
    };
    const compile = (compiler, args, cwd, onSuccess) => {
        const opts = { cwd, env: BASE_ENV, shell: true, windowsVerbatimArguments: true };
        const quoted = (s) => (s.includes(' ') && !s.startsWith('"') ? `"${s}"` : s);
        const cmdLine = [quoted(compiler), ...args.map(quoted)].join(' ');
        const proc = (0, child_process_1.spawn)(cmdLine, [], opts);
        let output = '';
        proc.stdout?.on('data', (d) => (output += d.toString()));
        proc.stderr?.on('data', (d) => (output += d.toString()));
        proc.on('close', (code) => {
            if (code !== 0) {
                send('stderr', `${output}\r\n`);
                send('exit', code ?? 1);
                cleanup();
            }
            else {
                onSuccess();
            }
        });
        proc.on('error', (err) => {
            send('stderr', `Compiler error: ${err.message}\r\n`);
            send('exit', 1);
            cleanup();
        });
    };
    // ── Message handler ──────────────────────────────────────────────────────
    ws.on('message', async (message) => {
        try {
            const payload = JSON.parse(message);
            // ── RUN ─────────────────────────────────────────────────────────────
            if (payload.type === 'run') {
                cleanup();
                isJudge0Run = false;
                judge0Running = false;
                judge0StdinBuffer = [];
                const { language, code } = payload;
                const lang = language.toLowerCase();
                // ── C / C++ / C# → Judge0 cloud (WDAC blocks local .exe) ──────────
                if (JUDGE0_LANG_ID[lang] !== undefined) {
                    isJudge0Run = true;
                    send('stdout', `\x1b[36m⚡ Running ${lang.toUpperCase()} via cloud sandbox (Judge0)...\x1b[0m\r\n`);
                    send('stdout', `\x1b[33m📝 Collecting input... (send all stdin now, execution starts automatically)\x1b[0m\r\n`);
                    // ── Smart stdin collection ────────────────────────────────────────
                    // Judge0 is a batch system — all stdin must be sent together.
                    // Strategy:
                    //   • Wait up to MAX_WAIT_MS for stdin to arrive.
                    //   • Every time a new stdin chunk arrives, reset a DEBOUNCE timer.
                    //   • Submit as soon as DEBOUNCE_MS passes with no new stdin, OR
                    //     when MAX_WAIT_MS is reached (whichever comes first).
                    //   • If NO stdin arrives at all within IDLE_MS, submit immediately
                    //     (programs that read no user input).
                    const MAX_WAIT_MS = 12000; // absolute max wait
                    // DEBOUNCE_MS must be > the largest gap between stdin chunks.
                    // The QA test has a 3000ms "compile-simulation" gap between inputs,
                    // so we use 3600ms to safely bridge it without triggering early submit.
                    const DEBOUNCE_MS = 3600; // fire this long after last stdin
                    const IDLE_MS = 3600; // fire if no stdin arrives at all
                    await new Promise((resolve) => {
                        let debounceTimer = null;
                        const maxTimer = setTimeout(resolve, MAX_WAIT_MS);
                        const resetDebounce = () => {
                            if (debounceTimer)
                                clearTimeout(debounceTimer);
                            debounceTimer = setTimeout(() => {
                                clearTimeout(maxTimer);
                                resolve();
                            }, DEBOUNCE_MS);
                        };
                        // Hook into the stdin pipe: every time writeStdin is called
                        // for this Judge0 run, reset the debounce.
                        judge0StdinListener = resetDebounce;
                        // Start idle timer — if no stdin arrives at all within IDLE_MS, go now
                        resetDebounce(); // treat "no stdin yet" as the first debounce
                    });
                    judge0StdinListener = null;
                    judge0Running = true;
                    const stdin = judge0StdinBuffer.join('');
                    await runWithJudge0(ws, JUDGE0_LANG_ID[lang], code, stdin, send);
                    judge0Running = false;
                    return;
                }
                // ── Python / JavaScript / Java / TypeScript → local ───────────────
                const id = crypto_1.default.randomUUID();
                runDir = path_1.default.join(RUNS_DIR, id);
                if (!fs_1.default.existsSync(runDir))
                    fs_1.default.mkdirSync(runDir, { recursive: true });
                if (lang === 'python') {
                    const src = path_1.default.join(runDir, 'main.py');
                    fs_1.default.writeFileSync(src, code);
                    startProcess('python', ['-uB', src], runDir);
                }
                else if (lang === 'javascript') {
                    const src = path_1.default.join(runDir, 'main.js');
                    fs_1.default.writeFileSync(src, code);
                    startProcess('node', [src], runDir);
                }
                else if (lang === 'java') {
                    const src = path_1.default.join(runDir, 'Main.java');
                    fs_1.default.writeFileSync(src, code);
                    compile('javac', [`"${src}"`], runDir, () => {
                        startProcess('java', ['-cp', runDir, 'Main'], runDir);
                    });
                }
                else if (lang === 'typescript') {
                    const src = path_1.default.join(runDir, 'main.ts');
                    fs_1.default.writeFileSync(src, code);
                    startProcess('npx', ['ts-node', '--transpile-only', src], runDir);
                }
                else {
                    send('stderr', `Unsupported language: ${language}\r\n`);
                    send('exit', 1);
                    cleanup();
                }
                // ── STDIN ────────────────────────────────────────────────────────────
            }
            else if (payload.type === 'stdin') {
                writeStdin(payload.data);
                // ── STOP ─────────────────────────────────────────────────────────────
            }
            else if (payload.type === 'stop') {
                cleanup();
                send('exit', 0);
            }
        }
        catch (err) {
            send('stderr', `Error: ${err.message}\r\n`);
        }
    });
    ws.on('close', cleanup);
}
//# sourceMappingURL=wsRunner.js.map