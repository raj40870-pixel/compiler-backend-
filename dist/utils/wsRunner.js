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
const runnerHelper_1 = require("./runnerHelper");
const RUNS_DIR = path_1.default.resolve(__dirname, '..', '..', 'bin', 'runs');
function handleWsConnection(ws) {
    let child = null;
    let runDir = '';
    let timeoutId = null;
    // Stdin buffering — queues input received before the process is ready
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
                child.kill('SIGKILL');
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
                    setTimeout(() => {
                        try {
                            fs_1.default.rmSync(d, { recursive: true, force: true });
                        }
                        catch (__) { }
                    }, 1200);
                }
            }, 250);
        }
    };
    const writeStdin = (data) => {
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
            const resolved = (0, runnerHelper_1.resolveCmd)(command);
            child = (0, child_process_1.spawn)(resolved, args, {
                cwd,
                env: runnerHelper_1.BASE_ENV,
                shell: false
            });
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
        try {
            const resolved = (0, runnerHelper_1.resolveCmd)(compiler);
            const compChild = (0, child_process_1.spawn)(resolved, args, {
                cwd,
                env: runnerHelper_1.BASE_ENV,
                shell: false
            });
            let output = '';
            compChild.stdout?.on('data', (d) => (output += d.toString()));
            compChild.stderr?.on('data', (d) => (output += d.toString()));
            compChild.on('close', (code) => {
                if (code !== 0) {
                    send('stderr', output.replace(/\n/g, '\r\n'));
                    send('exit', code ?? 1);
                    cleanup();
                }
                else {
                    onSuccess();
                }
            });
            compChild.on('error', (err) => {
                send('stderr', `Compiler execution failed: ${err.message}\r\n`);
                send('exit', 1);
                cleanup();
            });
            timeoutId = setTimeout(() => {
                if (compChild) {
                    try {
                        compChild.kill('SIGKILL');
                    }
                    catch (_) { }
                    send('stderr', '\r\nCompilation timed out (30 seconds)\r\n');
                    cleanup();
                }
            }, 30000);
        }
        catch (err) {
            send('stderr', `Compiler spawn failed: ${err.message}\r\n`);
            send('exit', 1);
            cleanup();
        }
    };
    // ── Message handler ──────────────────────────────────────────────────────
    ws.on('message', async (message) => {
        try {
            const payload = JSON.parse(message);
            // ── RUN ─────────────────────────────────────────────────────────────
            if (payload.type === 'run') {
                cleanup();
                const { language, code } = payload;
                const lang = language.toLowerCase();
                const isDocker = (0, runnerHelper_1.checkDockerAvailable)();
                if (isDocker) {
                    // Docker implementation
                    const codeB64 = Buffer.from(code).toString('base64');
                    let runCmd = '';
                    switch (lang) {
                        case 'c':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.c && gcc -O2 -Wall main.c -o main && ./main';
                            break;
                        case 'cpp':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.cpp && g++ -O2 -Wall main.cpp -o main && ./main';
                            break;
                        case 'python':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.py && python3 -u main.py';
                            break;
                        case 'java': {
                            const className = (0, runnerHelper_1.getJavaClassName)(code);
                            runCmd = `echo $CODE_B64 | base64 -d > ${className}.java && javac ${className}.java && java ${className}`;
                            break;
                        }
                        case 'javascript':
                        case 'node':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.js && node main.js';
                            break;
                        case 'typescript':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.ts && npx ts-node --transpile-only main.ts';
                            break;
                        case 'csharp': {
                            const projB64 = Buffer.from(runnerHelper_1.CS_PROJ_CONTENT).toString('base64');
                            runCmd = `echo ${projB64} | base64 -d > main.csproj && echo $CODE_B64 | base64 -d > Program.cs && dotnet run --no-restore --configuration Release`;
                            break;
                        }
                        case 'go':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.go && go run main.go';
                            break;
                        case 'php':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.php && php main.php';
                            break;
                        case 'rust':
                            runCmd = 'echo $CODE_B64 | base64 -d > main.rs && rustc main.rs -o main && ./main';
                            break;
                        default:
                            send('stderr', `Unsupported language in Docker: ${language}\r\n`);
                            send('exit', 1);
                            return;
                    }
                    const imageName = process.env.DOCKER_IMAGE || 'compiler-runner';
                    startProcess('docker', [
                        'run',
                        '--rm',
                        '-i',
                        '--net=none',
                        '--memory=256m',
                        '--cpus=0.5',
                        '-e', `CODE_B64=${codeB64}`,
                        imageName,
                        'sh',
                        '-c',
                        runCmd
                    ], os_1.default.tmpdir());
                    return;
                }
                // Host local spawn fallback
                const id = crypto_1.default.randomUUID();
                runDir = path_1.default.join(RUNS_DIR, id);
                if (!fs_1.default.existsSync(runDir)) {
                    fs_1.default.mkdirSync(runDir, { recursive: true });
                }
                const execExt = process.platform === 'win32' ? '.exe' : '';
                const binaryPath = path_1.default.join(runDir, 'main' + execExt);
                switch (lang) {
                    case 'c': {
                        const src = path_1.default.join(runDir, 'main.c');
                        fs_1.default.writeFileSync(src, (0, runnerHelper_1.injectStdoutUnbuffering)(code, 'c'));
                        compile('gcc', ['-O2', '-Wall', '-o', binaryPath, 'main.c'], runDir, () => {
                            startProcess(binaryPath, [], runDir);
                        });
                        break;
                    }
                    case 'cpp': {
                        const src = path_1.default.join(runDir, 'main.cpp');
                        fs_1.default.writeFileSync(src, (0, runnerHelper_1.injectStdoutUnbuffering)(code, 'cpp'));
                        compile('g++', ['-O2', '-Wall', '-o', binaryPath, 'main.cpp'], runDir, () => {
                            startProcess(binaryPath, [], runDir);
                        });
                        break;
                    }
                    case 'python': {
                        const src = path_1.default.join(runDir, 'main.py');
                        fs_1.default.writeFileSync(src, code);
                        const pyCmd = (0, runnerHelper_1.getPythonCmd)();
                        startProcess(pyCmd, ['-u', 'main.py'], runDir);
                        break;
                    }
                    case 'java': {
                        const className = (0, runnerHelper_1.getJavaClassName)(code);
                        const src = path_1.default.join(runDir, `${className}.java`);
                        fs_1.default.writeFileSync(src, code);
                        compile('javac', [`${className}.java`], runDir, () => {
                            startProcess('java', [className], runDir);
                        });
                        break;
                    }
                    case 'javascript':
                    case 'node': {
                        const src = path_1.default.join(runDir, 'main.js');
                        fs_1.default.writeFileSync(src, code);
                        startProcess('node', ['main.js'], runDir);
                        break;
                    }
                    case 'typescript': {
                        const src = path_1.default.join(runDir, 'main.ts');
                        fs_1.default.writeFileSync(src, code);
                        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
                        startProcess(npxCmd, ['ts-node', '--transpile-only', 'main.ts'], runDir);
                        break;
                    }
                    case 'csharp': {
                        const csprojPath = path_1.default.join(runDir, 'main.csproj');
                        fs_1.default.writeFileSync(csprojPath, runnerHelper_1.CS_PROJ_CONTENT);
                        const programPath = path_1.default.join(runDir, 'Program.cs');
                        fs_1.default.writeFileSync(programPath, code);
                        startProcess('dotnet', ['run', '--project', 'main.csproj', '--no-restore', '--configuration', 'Release'], runDir);
                        break;
                    }
                    case 'go': {
                        const src = path_1.default.join(runDir, 'main.go');
                        fs_1.default.writeFileSync(src, code);
                        startProcess('go', ['run', 'main.go'], runDir);
                        break;
                    }
                    case 'php': {
                        const src = path_1.default.join(runDir, 'main.php');
                        fs_1.default.writeFileSync(src, code);
                        startProcess('php', ['main.php'], runDir);
                        break;
                    }
                    case 'rust': {
                        const src = path_1.default.join(runDir, 'main.rs');
                        fs_1.default.writeFileSync(src, code);
                        compile('rustc', ['main.rs', '-o', binaryPath], runDir, () => {
                            startProcess(binaryPath, [], runDir);
                        });
                        break;
                    }
                    default:
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
            console.error('Message handler error:', err);
            send('stderr', `Error: ${err.message || 'Unknown error'}\r\n`);
            send('exit', 1);
            cleanup();
        }
    });
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        cleanup();
    });
    ws.on('close', cleanup);
}
//# sourceMappingURL=wsRunner.js.map