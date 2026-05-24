import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  BASE_ENV,
  checkDockerAvailable,
  getPythonCmd,
  getJavaClassName,
  injectStdoutUnbuffering,
  CS_PROJ_CONTENT,
  resolveCmd
} from './runnerHelper';

interface ExecutionResult {
  stdout: string;
  stderr: string;
}

const RUNS_DIR = path.resolve(__dirname, '..', '..', 'bin', 'runs');

// Spawns process directly and captures output to completion
function executeProcess(
  cmd: string,
  args: string[],
  cwd: string,
  stdinText = '',
  timeoutMs = 10000
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const resolvedCmd = resolveCmd(cmd);
    const useShell = process.platform === 'win32' && (resolvedCmd.endsWith('.cmd') || resolvedCmd.endsWith('.bat'));
    const child = spawn(resolvedCmd, args, { cwd, env: BASE_ENV, shell: useShell });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch (_) { }
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

export class CodeRunnerService {
  static async execute(
    code: string,
    language: string,
    input: string = ''
  ): Promise<ExecutionResult> {
    const lang = language.toLowerCase();
    const isDocker = checkDockerAvailable();

    if (isDocker) {
      return this.executeInDocker(code, lang, input);
    } else {
      return this.executeLocally(code, lang, input);
    }
  }

  private static async executeInDocker(
    code: string,
    lang: string,
    input: string
  ): Promise<ExecutionResult> {
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
        const className = getJavaClassName(code);
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
        const projB64 = Buffer.from(CS_PROJ_CONTENT).toString('base64');
        runCmd = `echo ${projB64} | base64 -d > main.csproj && echo $CODE_B64 | base64 -d > Program.cs && dotnet restore && dotnet run --configuration Release`;
        break;
      }
      case 'go':
        runCmd = 'echo $CODE_B64 | base64 -d > main.go && go run main.go';
        break;
      case 'php': {
        let phpCode = code;
        if (!phpCode.trim().startsWith('<?php')) {
          phpCode = '<?php\n' + phpCode;
        }
        const reqs = [...phpCode.matchAll(/\/\/\s*composer\s+require\s+([a-zA-Z0-9_\-\/]+)/gi)].map(m => m[1]);
        if (reqs.length > 0 && !phpCode.includes('vendor/autoload.php')) {
          phpCode = phpCode.replace(/<\?php/i, '<?php\nrequire_once __DIR__ . "/vendor/autoload.php";\n');
        }
        const inlineB64 = Buffer.from(phpCode).toString('base64');
        if (reqs.length > 0) {
          runCmd = `echo ${inlineB64} | base64 -d > main.php && composer require ${reqs.join(' ')} --quiet && php main.php`;
        } else {
          runCmd = `echo ${inlineB64} | base64 -d > main.php && php main.php`;
        }
        break;
      }
      case 'rust':
        runCmd = 'echo $CODE_B64 | base64 -d > main.rs && rustc main.rs -o main && ./main';
        break;
      default:
        return { stdout: '', stderr: `Unsupported language in Docker: ${lang}` };
    }

    const imageName = process.env.DOCKER_IMAGE || 'compiler-runner';
    const result = await executeProcess(
      'docker',
      [
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
      ],
      os.tmpdir(),
      input,
      12000 // 12 second limit
    );

    if (result.timedOut) {
      return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
    }

    return { stdout: result.stdout, stderr: result.stderr };
  }

  private static async executeLocally(
    code: string,
    lang: string,
    input: string
  ): Promise<ExecutionResult> {
    const id = crypto.randomUUID();
    const runDir = path.join(RUNS_DIR, id);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    try {
      const execExt = process.platform === 'win32' ? '.exe' : '';
      const binaryPath = path.join(runDir, 'main' + execExt);

      switch (lang) {
        case 'c': {
          const srcPath = path.join(runDir, 'main.c');
          fs.writeFileSync(srcPath, injectStdoutUnbuffering(code, 'c'));

          const compile = await executeProcess('gcc', ['-std=c11', '-O2', '-Wall', '-o', binaryPath, 'main.c'], runDir);
          if (compile.code !== 0) {
            return { stdout: '', stderr: compile.stderr || compile.stdout };
          }

          const run = await executeProcess(binaryPath, [], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'cpp': {
          const srcPath = path.join(runDir, 'main.cpp');
          fs.writeFileSync(srcPath, injectStdoutUnbuffering(code, 'cpp'));

          const compile = await executeProcess('g++', ['-std=c++14', '-O2', '-Wall', '-o', binaryPath, 'main.cpp'], runDir);
          if (compile.code !== 0) {
            return { stdout: '', stderr: compile.stderr || compile.stdout };
          }

          const run = await executeProcess(binaryPath, [], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'python': {
          const srcPath = path.join(runDir, 'main.py');
          fs.writeFileSync(srcPath, code);
          const pyCmd = getPythonCmd();

          const run = await executeProcess(pyCmd, ['-u', 'main.py'], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'java': {
          const className = getJavaClassName(code);
          const srcPath = path.join(runDir, `${className}.java`);
          fs.writeFileSync(srcPath, code);

          const compile = await executeProcess('javac', [`${className}.java`], runDir);
          if (compile.code !== 0) {
            return { stdout: '', stderr: compile.stderr || compile.stdout };
          }

          const run = await executeProcess('java', [className], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'javascript':
        case 'node': {
          const srcPath = path.join(runDir, 'main.js');
          fs.writeFileSync(srcPath, code);

          const run = await executeProcess('node', ['main.js'], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'typescript': {
          // Strip conflicting 'declare var' for globals TypeScript already declares (TS 4.4+ includes console, etc.)
          const builtinGlobals = ['require', 'process', 'console', 'module', '__dirname', '__filename', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];
          const cleanCode = code.split('\n').filter(line => {
            const trimmed = line.trim();
            return !builtinGlobals.some(g => trimmed === `declare var ${g}: any;` || trimmed === `declare var ${g}: any`);
          }).join('\n');

          const srcPath = path.join(runDir, 'main.ts');
          fs.writeFileSync(srcPath, cleanCode);
          const localTsc = path.resolve(__dirname, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
          // Write tsconfig in runDir so tsc doesn't conflict with files on commandline
          const nodeTypesPath = path.resolve(__dirname, '..', '..', 'node_modules', '@types');
          const tscfg = JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              module: 'commonjs',
              strict: false,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: '.',
              noEmitOnError: false,
              typeRoots: [nodeTypesPath],
              types: ['node']
            },
            files: ['main.ts']
          });
          fs.writeFileSync(path.join(runDir, 'tsconfig.json'), tscfg);

          const compile = await executeProcess('node', [localTsc, '--project', path.join(runDir, 'tsconfig.json')], runDir);
          if (compile.code !== 0) {
            if (!fs.existsSync(path.join(runDir, 'main.js'))) {
              return { stdout: '', stderr: compile.stderr || compile.stdout };
            }
          }

          const run = await executeProcess('node', ['main.js'], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'csharp': {
          const csprojPath = path.join(runDir, 'main.csproj');
          fs.writeFileSync(csprojPath, CS_PROJ_CONTENT);
          const programPath = path.join(runDir, 'Program.cs');
          fs.writeFileSync(programPath, code);

          const restore = await executeProcess('dotnet', ['restore'], runDir);
          if (restore.code !== 0) {
            return { stdout: '', stderr: restore.stderr || restore.stdout };
          }

          const run = await executeProcess('dotnet', ['run', '--project', 'main.csproj', '--configuration', 'Release'], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'go': {
          const srcPath = path.join(runDir, 'main.go');
          fs.writeFileSync(srcPath, code);

          const run = await executeProcess('go', ['run', 'main.go'], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'php': {
          const srcPath = path.join(runDir, 'main.php');
          let phpCode = code;
          if (!phpCode.trim().startsWith('<?php')) {
            phpCode = '<?php\n' + phpCode;
          }
          
          const composerRequires = [...phpCode.matchAll(/\/\/\s*composer\s+require\s+([a-zA-Z0-9_\-\/]+)/gi)].map(m => m[1] as string);
          if (composerRequires.length > 0 && !phpCode.includes('vendor/autoload.php')) {
            phpCode = phpCode.replace(/<\?php/i, '<?php\nrequire_once __DIR__ . "/vendor/autoload.php";\n');
          }
          
          fs.writeFileSync(srcPath, phpCode);

          if (composerRequires.length > 0) {
            const comp = await executeProcess('composer', ['require', ...composerRequires, '--quiet'], runDir, '', 30000);
            if (comp.code !== 0) {
              return { stdout: '', stderr: comp.stderr || comp.stdout };
            }
          }

          const run = await executeProcess('php', ['main.php'], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        case 'rust': {
          const srcPath = path.join(runDir, 'main.rs');
          fs.writeFileSync(srcPath, code);

          const compile = await executeProcess('rustc', ['main.rs', '-C', 'linker=rust-lld', '-o', binaryPath], runDir);
          if (compile.code !== 0) {
            return { stdout: '', stderr: compile.stderr || compile.stdout };
          }

          const run = await executeProcess(binaryPath, [], runDir, input);
          if (run.timedOut) return { stdout: '', stderr: '⏱  Execution Timed Out (10s)' };
          return { stdout: run.stdout, stderr: run.stderr };
        }

        default:
          return { stdout: '', stderr: `Unsupported language: ${lang}` };
      }
    } finally {
      // Clean up directory
      try {
        fs.rmSync(runDir, { recursive: true, force: true });
      } catch (_) { }
    }
  }
}
