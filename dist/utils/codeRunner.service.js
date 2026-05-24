"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeRunnerService = void 0;
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const runnerHelper_1 = require("./runnerHelper");
const RUNS_DIR = path_1.default.resolve(__dirname, '..', '..', 'bin', 'runs');
// Spawns process directly and captures output to completion
function executeProcess(cmd, args, cwd, stdinText = '', timeoutMs = 10000) {
    return new Promise((resolve) => {
        const resolvedCmd = (0, runnerHelper_1.resolveCmd)(cmd);
        const child = (0, child_process_1.spawn)(resolvedCmd, args, { cwd, env: runnerHelper_1.BASE_ENV });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill('SIGKILL');
            }
            catch (_) { }
        }, timeoutMs);
        if (stdinText && child.stdin) {
            child.stdin.write(stdinText);
            child.stdin.end();
        }
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, timedOut });
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ code: -1, stdout, stderr: stderr + `\nFailed to start process: ${err.message}`, timedOut });
        });
    });
}
class CodeRunnerService {
    static async execute(code, language, input = '') {
        const lang = language.toLowerCase();
        const isDocker = (0, runnerHelper_1.checkDockerAvailable)();
        if (isDocker) {
            return this.executeInDocker(code, lang, input);
        }
        else {
            return this.executeLocally(code, lang, input);
        }
    }
    static async executeInDocker(code, lang, input) {
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
                return { stdout: '', stderr: `Unsupported language in Docker: ${lang}` };
        }
        const imageName = process.env.DOCKER_IMAGE || 'compiler-runner';
        const result = await executeProcess('docker', [
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
        ], os_1.default.tmpdir(), input, 12000 // 12 second limit
        );
        if (result.timedOut) {
            return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
        }
        return { stdout: result.stdout, stderr: result.stderr };
    }
    static async executeLocally(code, lang, input) {
        const id = crypto_1.default.randomUUID();
        const runDir = path_1.default.join(RUNS_DIR, id);
        if (!fs_1.default.existsSync(runDir)) {
            fs_1.default.mkdirSync(runDir, { recursive: true });
        }
        try {
            const execExt = process.platform === 'win32' ? '.exe' : '';
            const binaryPath = path_1.default.join(runDir, 'main' + execExt);
            switch (lang) {
                case 'c': {
                    const srcPath = path_1.default.join(runDir, 'main.c');
                    fs_1.default.writeFileSync(srcPath, (0, runnerHelper_1.injectStdoutUnbuffering)(code, 'c'));
                    const compile = await executeProcess('gcc', ['-O2', '-Wall', '-o', binaryPath, 'main.c'], runDir);
                    if (compile.code !== 0) {
                        return { stdout: '', stderr: compile.stderr || compile.stdout };
                    }
                    const run = await executeProcess(binaryPath, [], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'cpp': {
                    const srcPath = path_1.default.join(runDir, 'main.cpp');
                    fs_1.default.writeFileSync(srcPath, (0, runnerHelper_1.injectStdoutUnbuffering)(code, 'cpp'));
                    const compile = await executeProcess('g++', ['-O2', '-Wall', '-o', binaryPath, 'main.cpp'], runDir);
                    if (compile.code !== 0) {
                        return { stdout: '', stderr: compile.stderr || compile.stdout };
                    }
                    const run = await executeProcess(binaryPath, [], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'python': {
                    const srcPath = path_1.default.join(runDir, 'main.py');
                    fs_1.default.writeFileSync(srcPath, code);
                    const pyCmd = (0, runnerHelper_1.getPythonCmd)();
                    const run = await executeProcess(pyCmd, ['-u', 'main.py'], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'java': {
                    const className = (0, runnerHelper_1.getJavaClassName)(code);
                    const srcPath = path_1.default.join(runDir, `${className}.java`);
                    fs_1.default.writeFileSync(srcPath, code);
                    const compile = await executeProcess('javac', [`${className}.java`], runDir);
                    if (compile.code !== 0) {
                        return { stdout: '', stderr: compile.stderr || compile.stdout };
                    }
                    const run = await executeProcess('java', [className], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'javascript':
                case 'node': {
                    const srcPath = path_1.default.join(runDir, 'main.js');
                    fs_1.default.writeFileSync(srcPath, code);
                    const run = await executeProcess('node', ['main.js'], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'typescript': {
                    const srcPath = path_1.default.join(runDir, 'main.ts');
                    fs_1.default.writeFileSync(srcPath, code);
                    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
                    const run = await executeProcess(npxCmd, ['ts-node', '--transpile-only', 'main.ts'], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'csharp': {
                    const csprojPath = path_1.default.join(runDir, 'main.csproj');
                    fs_1.default.writeFileSync(csprojPath, runnerHelper_1.CS_PROJ_CONTENT);
                    const programPath = path_1.default.join(runDir, 'Program.cs');
                    fs_1.default.writeFileSync(programPath, code);
                    const run = await executeProcess('dotnet', ['run', '--project', 'main.csproj', '--no-restore', '--configuration', 'Release'], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'go': {
                    const srcPath = path_1.default.join(runDir, 'main.go');
                    fs_1.default.writeFileSync(srcPath, code);
                    const run = await executeProcess('go', ['run', 'main.go'], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'php': {
                    const srcPath = path_1.default.join(runDir, 'main.php');
                    fs_1.default.writeFileSync(srcPath, code);
                    const run = await executeProcess('php', ['main.php'], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                case 'rust': {
                    const srcPath = path_1.default.join(runDir, 'main.rs');
                    fs_1.default.writeFileSync(srcPath, code);
                    const compile = await executeProcess('rustc', ['main.rs', '-o', binaryPath], runDir);
                    if (compile.code !== 0) {
                        return { stdout: '', stderr: compile.stderr || compile.stdout };
                    }
                    const run = await executeProcess(binaryPath, [], runDir, input);
                    if (run.timedOut)
                        return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
                    return { stdout: run.stdout, stderr: run.stderr };
                }
                default:
                    return { stdout: '', stderr: `Unsupported language: ${lang}` };
            }
        }
        finally {
            // Clean up directory
            try {
                fs_1.default.rmSync(runDir, { recursive: true, force: true });
            }
            catch (_) { }
        }
    }
}
exports.CodeRunnerService = CodeRunnerService;
//# sourceMappingURL=codeRunner.service.js.map