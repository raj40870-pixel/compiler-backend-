import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

interface ExecutionResult {
  stdout: string;
  stderr: string;
}

// Add common compiler paths to PATH
const ADDITIONAL_PATHS = [
  'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
  'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
  'C:\\MinGW\\bin',
  'C:\\msys64\\mingw64\\bin',
  'C:\\Python312',
  'C:\\Python311',
  'C:\\Python310',
  'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python312',
  'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python311',
  'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python310',
];

// Filter out Windows Store stub aliases — they are not real Python installs
const filteredPath = (process.env.PATH || '')
  .split(';')
  .filter(p => !p.toLowerCase().includes('windowsapps'))
  .join(';');

process.env.PATH = `${ADDITIONAL_PATHS.join(';')};${filteredPath}`;
process.env.PYTHONIOENCODING = 'utf-8';

export class CodeRunnerService {
  static async execute(code: string, language: string, input: string = ''): Promise<ExecutionResult> {
    const executionId = crypto.randomUUID();
    const tempDir = path.join(os.tmpdir(), 'compler-bro', executionId);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
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
    } finally {
      // Cleanup is handled within each run method or here if needed
      // Most methods cleanup their own files to ensure sequential access doesn't fail
    }
  }

  private static async runCommand(command: string, args: string[], input: string, tempDir: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { shell: true, cwd: tempDir });
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

  private static async runC(code: string, input: string, tempDir: string): Promise<ExecutionResult> {
    const codeFile = path.join(tempDir, 'main.c');
    const exeFile = path.join(tempDir, 'main.exe');
    fs.writeFileSync(codeFile, code);

    const compile = await this.runCommand('gcc', ['-std=c11', `"${codeFile}"`, '-o', `"${exeFile}"`], '', tempDir);
    if (compile.stderr && !fs.existsSync(exeFile)) {
      return compile;
    }

    const result = await this.runCommand(`"${exeFile}"`, [], input, tempDir);
    return result;
  }

  private static async runCpp(code: string, input: string, tempDir: string): Promise<ExecutionResult> {
    const codeFile = path.join(tempDir, 'main.cpp');
    const exeFile = path.join(tempDir, 'main.exe');
    fs.writeFileSync(codeFile, code);

    const compile = await this.runCommand('g++', ['-std=c++14', `"${codeFile}"`, '-o', `"${exeFile}"`], '', tempDir);
    if (compile.stderr && !fs.existsSync(exeFile)) {
      return compile;
    }

    return await this.runCommand(`"${exeFile}"`, [], input, tempDir);
  }

  private static async runPython(code: string, input: string, tempDir: string): Promise<ExecutionResult> {
    const codeFile = path.join(tempDir, 'main.py');
    fs.writeFileSync(codeFile, code);

    const NOT_FOUND_SIGNALS = [
      'not recognized',
      'not found',
      'Microsoft Store',
      'cannot find',
      'No such file',
      'Failed to start',
    ];

    const isPythonMissing = (stderr: string) =>
      NOT_FOUND_SIGNALS.some(sig => stderr.toLowerCase().includes(sig.toLowerCase()));

    // Try python first, then python3
    let result = await this.runCommand('python', [`"${codeFile}"`], input, tempDir);
    if (isPythonMissing(result.stderr)) {
      result = await this.runCommand('python3', [`"${codeFile}"`], input, tempDir);
    }

    // If still not found, return a friendly error
    if (isPythonMissing(result.stderr)) {
      return {
        stdout: '',
        stderr:
          'Python is not installed on this machine.\n\n' +
          'Please install Python from https://www.python.org/downloads/\n' +
          'Make sure to check "Add Python to PATH" during installation, then restart the compiler server.',
      };
    }

    return result;
  }

  private static async runJava(code: string, input: string, tempDir: string): Promise<ExecutionResult> {
    const codeFile = path.join(tempDir, 'Main.java');
    fs.writeFileSync(codeFile, code);
    const compile = await this.runCommand('javac', [`"${codeFile}"`], '', tempDir);
    if (compile.stderr && !fs.existsSync(path.join(tempDir, 'Main.class'))) {
      return compile;
    }
    return await this.runCommand('java', ['Main'], input, tempDir);
  }

  private static async runNode(code: string, input: string, tempDir: string): Promise<ExecutionResult> {
    const codeFile = path.join(tempDir, 'main.js');
    fs.writeFileSync(codeFile, code);
    return await this.runCommand('node', [`"${codeFile}"`], input, tempDir);
  }
}

