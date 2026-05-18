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
// Detect compiler absolute paths on Windows
const MINGW_PATHS = [
    'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
    'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
    'C:\\MinGW\\bin',
    'C:\\msys64\\mingw64\\bin',
];
function findCompiler(name) {
    for (const dir of MINGW_PATHS) {
        const full = path_1.default.join(dir, name + '.exe');
        if (fs_1.default.existsSync(full))
            return full;
    }
    return name; // fallback — let shell resolve it
}
const GCC = findCompiler('gcc');
const GPP = findCompiler('g++');
// Build an enriched PATH so shell-based spawns also work
const EXTRA_PATHS = [
    ...MINGW_PATHS,
    'C:\\Python312',
    'C:\\Python311',
    'C:\\Python310',
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python312`,
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python311`,
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python310`,
];
const ENRICHED_PATH = [
    ...EXTRA_PATHS,
    ...(process.env.PATH || '').split(';').filter(p => !p.toLowerCase().includes('windowsapps')),
].join(';');
// Base environment for all child processes
const BASE_ENV = {
    ...process.env,
    PATH: ENRICHED_PATH,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
};
// Directory where compiled binaries are stored (outside AppLocker-blocked temp)
const RUNS_DIR = path_1.default.resolve(__dirname, '..', '..', 'bin', 'runs');
function handleWsConnection(ws) {
    let child = null;
    let runDir = '';
    let timeoutId = null;
    // ── STDIN BUFFER: queues stdin received before process is ready ──
    // Compiled languages (C, C++, Java) receive stdin during compilation
    // and would lose it without this queue.
    let stdinQueue = [];
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
    // Write stdin data — or queue it if process not yet started
    const writeStdin = (data) => {
        if (child?.stdin?.writable) {
            child.stdin.write(data);
        }
        else {
            // Process not ready yet (e.g. compiling) — buffer for when it starts
            stdinQueue.push(data);
        }
    };
    // Flush buffered stdin to process once it has started
    const flushStdinQueue = () => {
        if (!child?.stdin?.writable)
            return;
        while (stdinQueue.length > 0) {
            const chunk = stdinQueue.shift();
            child.stdin.write(chunk);
        }
    };
    // Spawn a long-running interactive process (shell: false for real-time stdio)
    const startProcess = (command, args, cwd) => {
        try {
            const opts = { cwd, env: BASE_ENV };
            child = (0, child_process_1.spawn)(command, args, opts);
            // Flush any stdin that arrived during compilation immediately
            flushStdinQueue();
            child.stdout?.on('data', d => send('stdout', d.toString()));
            child.stderr?.on('data', d => send('stderr', d.toString()));
            child.on('close', code => { send('exit', code ?? 0); cleanup(); });
            child.on('error', err => {
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
    // Run a compile step (shell: true is acceptable here — we control all args)
    const compile = (compiler, args, cwd, onSuccess) => {
        // Wrap compiler path in quotes in case it contains spaces (Windows)
        const quotedCompiler = compiler.includes(' ') ? `"${compiler}"` : compiler;
        const proc = (0, child_process_1.spawn)(quotedCompiler, args, { shell: true, cwd, env: BASE_ENV });
        let stderr = '';
        proc.stderr?.on('data', d => (stderr += d.toString()));
        proc.on('close', code => {
            if (code !== 0) {
                send('stderr', `${stderr}\r\n`);
                send('exit', code ?? 1);
                cleanup();
            }
            else {
                onSuccess();
            }
        });
        proc.on('error', err => {
            send('stderr', `Compiler error: ${err.message}\r\n`);
            send('exit', 1);
            cleanup();
        });
    };
    ws.on('message', async (message) => {
        try {
            const payload = JSON.parse(message);
            if (payload.type === 'run') {
                cleanup();
                const { language, code } = payload;
                const id = crypto_1.default.randomUUID();
                runDir = path_1.default.join(RUNS_DIR, id);
                if (!fs_1.default.existsSync(runDir))
                    fs_1.default.mkdirSync(runDir, { recursive: true });
                const lang = language.toLowerCase();
                // ── C / C++ ────────────────────────────────────────────────────
                if (lang === 'c' || lang === 'cpp') {
                    const isCpp = lang === 'cpp';
                    const ext = isCpp ? 'cpp' : 'c';
                    const src = path_1.default.join(runDir, `main.${ext}`);
                    const exe = path_1.default.join(runDir, 'main.exe');
                    // Inject stdout/stderr unbuffering at the very start of main()
                    let src_code = code;
                    const mainIdx = code.search(/\bmain\s*\(/);
                    if (mainIdx !== -1) {
                        const braceIdx = code.indexOf('{', mainIdx);
                        if (braceIdx !== -1) {
                            const ubuf = isCpp
                                ? '\n#include <cstdio>\n'
                                : '\n#include <stdio.h>\n';
                            src_code =
                                code.slice(0, braceIdx + 1) +
                                    ubuf +
                                    'setvbuf(stdout,NULL,_IONBF,0);setvbuf(stderr,NULL,_IONBF,0);\n' +
                                    code.slice(braceIdx + 1);
                        }
                    }
                    fs_1.default.writeFileSync(src, src_code);
                    const compiler = isCpp ? GPP : GCC;
                    const std = isCpp ? '-std=c++14' : '-std=c11';
                    compile(compiler, [std, `"${src}"`, '-o', `"${exe}"`], runDir, () => {
                        startProcess(exe, [], runDir);
                    });
                    // ── Java ───────────────────────────────────────────────────────
                }
                else if (lang === 'java') {
                    const src = path_1.default.join(runDir, 'Main.java');
                    fs_1.default.writeFileSync(src, code);
                    compile('javac', [`"${src}"`], runDir, () => {
                        startProcess('java', ['-cp', runDir, 'Main'], runDir);
                    });
                    // ── Python ─────────────────────────────────────────────────────
                }
                else if (lang === 'python') {
                    const src = path_1.default.join(runDir, 'main.py');
                    fs_1.default.writeFileSync(src, code);
                    // -u = force unbuffered; -B = don't write .pyc bytecode
                    startProcess('python', ['-uB', src], runDir);
                    // ── JavaScript ─────────────────────────────────────────────────
                }
                else if (lang === 'javascript') {
                    const src = path_1.default.join(runDir, 'main.js');
                    fs_1.default.writeFileSync(src, code);
                    startProcess('node', [src], runDir);
                }
                else {
                    send('stderr', `Unsupported language: ${language}\r\n`);
                    send('exit', 1);
                    cleanup();
                }
            }
            else if (payload.type === 'stdin') {
                // writeStdin queues if process not ready yet, writes directly if it is
                writeStdin(payload.data);
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