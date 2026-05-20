"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeRunnerService = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
// ─────────────────────────────────────────────────────────────────────────────
//  Judge0 CE – public free instance (no API key required for basic usage)
//  Docs: https://ce.judge0.com  |  https://github.com/judge0/judge0
// ─────────────────────────────────────────────────────────────────────────────
const JUDGE0_BASE = 'https://ce.judge0.com';
// Judge0 language IDs
const JUDGE0_LANG = {
    c: 50, // C (GCC 10.2.0)
    cpp: 54, // C++ (GCC 10.2.0)
    csharp: 51, // C# (Mono 6.12.0)
};
// ─────────────────────────────────────────────────────────────────────────────
//  Local PATH enrichment for Python / Java / Node
// ─────────────────────────────────────────────────────────────────────────────
const ADDITIONAL_PATHS = [
    'C:\\Program Files\\nodejs',
    'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
    'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
    'C:\\MinGW\\bin',
    'C:\\msys64\\mingw64\\bin',
    'C:\\Python312',
    'C:\\Python311',
    'C:\\Python310',
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python312`,
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python311`,
    `C:\\Users\\${os_1.default.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python310`,
];
const filteredPath = (process.env.PATH || '')
    .split(';')
    .filter(p => !p.toLowerCase().includes('windowsapps'))
    .join(';');
process.env.PATH = `${ADDITIONAL_PATHS.join(';')};${filteredPath}`;
process.env.PYTHONIOENCODING = 'utf-8';
process.env.PYTHONUNBUFFERED = '1';
// ─────────────────────────────────────────────────────────────────────────────
//  Judge0 helpers
// ─────────────────────────────────────────────────────────────────────────────
function judge0Request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'ce.judge0.com',
            path: urlPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };
        const req = https_1.default.request(options, (res) => {
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        if (body)
            req.write(body);
        req.end();
    });
}
async function runWithJudge0(langId, sourceCode, stdin = '') {
    // 1️⃣  Submit submission
    const submitBody = JSON.stringify({
        language_id: langId,
        source_code: Buffer.from(sourceCode).toString('base64'),
        stdin: Buffer.from(stdin).toString('base64'),
        base64_encoded: true,
    });
    let submitResponse;
    try {
        submitResponse = await judge0Request('POST', '/submissions?base64_encoded=true&wait=false', submitBody);
    }
    catch (err) {
        return {
            stdout: '',
            stderr: `⚠️  Judge0 submission failed: ${err.message}\n\nNote: C/C++/C# run via the Judge0 cloud API on this machine (WDAC policy blocks local .exe files). Please check your internet connection.`,
        };
    }
    let token;
    try {
        token = JSON.parse(submitResponse).token;
        if (!token)
            throw new Error('No token in response');
    }
    catch {
        return {
            stdout: '',
            stderr: `⚠️  Judge0 error: unexpected response – ${submitResponse.slice(0, 300)}`,
        };
    }
    // 2️⃣  Poll for result (max ~30 s)
    const MAX_POLLS = 30;
    const POLL_INTERVAL_MS = 1000;
    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        let pollResponse;
        try {
            pollResponse = await judge0Request('GET', `/submissions/${token}?base64_encoded=true`);
        }
        catch (err) {
            return { stdout: '', stderr: `⚠️  Judge0 poll error: ${err.message}` };
        }
        let result;
        try {
            result = JSON.parse(pollResponse);
        }
        catch {
            continue;
        }
        const statusId = result.status?.id ?? 0;
        // Status IDs: 1=Queued, 2=Processing, 3=Accepted, 4=Wrong Answer, 5=TLE,
        //             6=Compilation Error, 7-12=Runtime Errors, 13=Internal Error, 14=Exec Format Error
        if (statusId <= 2)
            continue; // still processing
        const decode = (b64) => b64 ? Buffer.from(b64, 'base64').toString('utf-8') : '';
        const stdout = decode(result.stdout);
        let stderr = decode(result.stderr) + decode(result.compile_output) + decode(result.message);
        // Surface friendly status messages
        if (statusId === 5)
            stderr += '\n⏱  Time Limit Exceeded';
        if (statusId === 14)
            stderr += '\n🚫  Execution Format Error';
        return { stdout, stderr };
    }
    return {
        stdout: '',
        stderr: '⚠️  Judge0 timed out waiting for result (30 s). Please try again.',
    };
}
// ─────────────────────────────────────────────────────────────────────────────
//  Local runner (Python / JavaScript / Java)
// ─────────────────────────────────────────────────────────────────────────────
function runCommand(command, args, input, tempDir) {
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(command, args, { shell: true, cwd: tempDir });
        let stdout = '';
        let stderr = '';
        if (input)
            child.stdin.write(input);
        child.stdin.end();
        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        const timeout = setTimeout(() => {
            child.kill();
            resolve({ stdout, stderr: stderr + '\nExecution timed out (10s)' });
        }, 10000);
        child.on('close', () => {
            clearTimeout(timeout);
            resolve({ stdout, stderr });
        });
        child.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ stdout, stderr: stderr + `\nFailed to start execution: ${err.message}` });
        });
    });
}
function makeTempDir() {
    const tempDir = path_1.default.join(os_1.default.tmpdir(), 'compler-bro', crypto_1.default.randomUUID());
    fs_1.default.mkdirSync(tempDir, { recursive: true });
    return tempDir;
}
async function runPython(code, input, tempDir) {
    const codeFile = path_1.default.join(tempDir, 'main.py');
    fs_1.default.writeFileSync(codeFile, code);
    const NOT_FOUND = ['not recognized', 'not found', 'Microsoft Store', 'cannot find', 'No such file', 'Failed to start'];
    const isMissing = (s) => NOT_FOUND.some(sig => s.toLowerCase().includes(sig.toLowerCase()));
    let result = await runCommand('python', [`"${codeFile}"`], input, tempDir);
    if (isMissing(result.stderr)) {
        result = await runCommand('python3', [`"${codeFile}"`], input, tempDir);
    }
    if (isMissing(result.stderr)) {
        return {
            stdout: '',
            stderr: 'Python is not installed on this machine.\n\n' +
                'Please install Python from https://www.python.org/downloads/\n' +
                'Make sure to check "Add Python to PATH" during installation, then restart the compiler server.',
        };
    }
    return result;
}
async function runJava(code, input, tempDir) {
    const codeFile = path_1.default.join(tempDir, 'Main.java');
    fs_1.default.writeFileSync(codeFile, code);
    const compile = await runCommand('javac', [`"${codeFile}"`], '', tempDir);
    if (compile.stderr && !fs_1.default.existsSync(path_1.default.join(tempDir, 'Main.class'))) {
        return compile;
    }
    return runCommand('java', ['Main'], input, tempDir);
}
async function runNode(code, input, tempDir) {
    const codeFile = path_1.default.join(tempDir, 'main.js');
    fs_1.default.writeFileSync(codeFile, code);
    return runCommand('node', [`"${codeFile}"`], input, tempDir);
}
// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────
class CodeRunnerService {
    static async execute(code, language, input = '') {
        const lang = language.toLowerCase();
        // C, C++, C# → Judge0 cloud (WDAC blocks local compiled .exe on this machine)
        if (JUDGE0_LANG[lang] !== undefined) {
            return runWithJudge0(JUDGE0_LANG[lang], code, input);
        }
        // Python, JavaScript, Java → local execution
        const tempDir = makeTempDir();
        try {
            switch (lang) {
                case 'python':
                    return await runPython(code, input, tempDir);
                case 'javascript':
                    return await runNode(code, input, tempDir);
                case 'java':
                    return await runJava(code, input, tempDir);
                default:
                    return { stdout: '', stderr: `Unsupported language: ${language}` };
            }
        }
        finally {
            // temp dir cleanup (best-effort)
            try {
                fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
            catch (_) { }
        }
    }
}
exports.CodeRunnerService = CodeRunnerService;
//# sourceMappingURL=codeRunner.service.js.map