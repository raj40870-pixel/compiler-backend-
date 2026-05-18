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
// Add common compiler paths to PATH
const ADDITIONAL_PATHS = [
    'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
    'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
    'C:\\MinGW\\bin',
    'C:\\msys64\\mingw64\\bin',
    'C:\\Python312',
    'C:\\Python311',
    'C:\\Python310',
    'C:\\Users\\' + os_1.default.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python312',
    'C:\\Users\\' + os_1.default.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python311',
    'C:\\Users\\' + os_1.default.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python310',
];
// Filter out Windows Store stub aliases — they are not real Python installs
const filteredPath = (process.env.PATH || '')
    .split(';')
    .filter(p => !p.toLowerCase().includes('windowsapps'))
    .join(';');
process.env.PATH = `${ADDITIONAL_PATHS.join(';')};${filteredPath}`;
process.env.PYTHONIOENCODING = 'utf-8';
process.env.PYTHONUNBUFFERED = '1';
class CodeRunnerService {
    static async execute(code, language, input = '') {
        const executionId = crypto_1.default.randomUUID();
        const tempDir = path_1.default.join(os_1.default.tmpdir(), 'compler-bro', executionId);
        if (!fs_1.default.existsSync(tempDir)) {
            fs_1.default.mkdirSync(tempDir, { recursive: true });
        }
        try {
            switch (language.toLowerCase()) {
                case 'c':
                    return await this.runC(code, input, tempDir);
                case 'cpp':
                    return await this.runCpp(code, input, tempDir);
                case 'python':
                    return await this.runPython(code, input, tempDir);
                case 'java':
                    return await this.runJava(code, input, tempDir);
                case 'javascript':
                    return await this.runNode(code, input, tempDir);
                default:
                    throw new Error(`Unsupported language: ${language}`);
            }
        }
        finally {
            // Cleanup is handled within each run method or here if needed
            // Most methods cleanup their own files to ensure sequential access doesn't fail
        }
    }
    static async runCommand(command, args, input, tempDir) {
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(command, args, { shell: true, cwd: tempDir });
            let stdout = '';
            let stderr = '';
            if (input) {
                child.stdin.write(input);
            }
            child.stdin.end();
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });
            const timeout = setTimeout(() => {
                child.kill();
                resolve({ stdout, stderr: stderr + '\nExecution timed out (10s)' });
            }, 10000);
            child.on('close', (code) => {
                clearTimeout(timeout);
                resolve({ stdout, stderr });
            });
            child.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ stdout, stderr: stderr + `\nFailed to start execution: ${err.message}` });
            });
        });
    }
    static async runC(code, input, tempDir) {
        const isWin = os_1.default.platform() === 'win32';
        const codeFile = path_1.default.join(tempDir, 'main.c');
        const exeFile = path_1.default.join(tempDir, isWin ? 'main.exe' : 'main.out');
        fs_1.default.writeFileSync(codeFile, code);
        const compile = await this.runCommand('gcc', ['-std=c11', `"${codeFile}"`, '-o', `"${exeFile}"`], '', tempDir);
        if (compile.stderr && !fs_1.default.existsSync(exeFile)) {
            return compile;
        }
        if (!isWin && fs_1.default.existsSync(exeFile)) {
            try {
                fs_1.default.chmodSync(exeFile, 0o755);
            }
            catch (_) { }
        }
        const result = await this.runCommand(`"${exeFile}"`, [], input, tempDir);
        return result;
    }
    static async runCpp(code, input, tempDir) {
        const isWin = os_1.default.platform() === 'win32';
        const codeFile = path_1.default.join(tempDir, 'main.cpp');
        const exeFile = path_1.default.join(tempDir, isWin ? 'main.exe' : 'main.out');
        fs_1.default.writeFileSync(codeFile, code);
        const compile = await this.runCommand('g++', ['-std=c++14', `"${codeFile}"`, '-o', `"${exeFile}"`], '', tempDir);
        if (compile.stderr && !fs_1.default.existsSync(exeFile)) {
            return compile;
        }
        if (!isWin && fs_1.default.existsSync(exeFile)) {
            try {
                fs_1.default.chmodSync(exeFile, 0o755);
            }
            catch (_) { }
        }
        return await this.runCommand(`"${exeFile}"`, [], input, tempDir);
    }
    static async runPython(code, input, tempDir) {
        const codeFile = path_1.default.join(tempDir, 'main.py');
        fs_1.default.writeFileSync(codeFile, code);
        const NOT_FOUND_SIGNALS = [
            'not recognized',
            'not found',
            'Microsoft Store',
            'cannot find',
            'No such file',
            'Failed to start',
        ];
        const isPythonMissing = (stderr) => NOT_FOUND_SIGNALS.some(sig => stderr.toLowerCase().includes(sig.toLowerCase()));
        // Try python first, then python3
        let result = await this.runCommand('python', [`"${codeFile}"`], input, tempDir);
        if (isPythonMissing(result.stderr)) {
            result = await this.runCommand('python3', [`"${codeFile}"`], input, tempDir);
        }
        // If still not found, return a friendly error
        if (isPythonMissing(result.stderr)) {
            return {
                stdout: '',
                stderr: 'Python is not installed on this machine.\n\n' +
                    'Please install Python from https://www.python.org/downloads/\n' +
                    'Make sure to check "Add Python to PATH" during installation, then restart the compiler server.',
            };
        }
        return result;
    }
    static async runJava(code, input, tempDir) {
        const codeFile = path_1.default.join(tempDir, 'Main.java');
        fs_1.default.writeFileSync(codeFile, code);
        const compile = await this.runCommand('javac', [`"${codeFile}"`], '', tempDir);
        if (compile.stderr && !fs_1.default.existsSync(path_1.default.join(tempDir, 'Main.class'))) {
            return compile;
        }
        return await this.runCommand('java', ['Main'], input, tempDir);
    }
    static async runNode(code, input, tempDir) {
        const codeFile = path_1.default.join(tempDir, 'main.js');
        fs_1.default.writeFileSync(codeFile, code);
        return await this.runCommand('node', [`"${codeFile}"`], input, tempDir);
    }
}
exports.CodeRunnerService = CodeRunnerService;
//# sourceMappingURL=codeRunner.service.js.map