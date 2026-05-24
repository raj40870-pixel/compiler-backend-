import { WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import {
  BASE_ENV,
  checkDockerAvailable,
  getPythonCmd,
  getJavaClassName,
  injectStdoutUnbuffering,
  CS_PROJ_CONTENT,
  resolveCmd,
  getTsNodeCmd,
  TS_CONFIG_CONTENT,
  compilerExists,
} from './runnerHelper';

const RUNS_DIR = path.resolve(__dirname, '..', '..', 'bin', 'runs');

export function handleWsConnection(ws: WebSocket) {
  let child: ChildProcess | null = null;
  let runDir = '';
  let timeoutId: NodeJS.Timeout | null = null;
  let stdinQueue: string[] = [];

  const send = (type: string, data: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  };

  const cleanup = () => {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (child) {
      try { child.kill('SIGKILL'); } catch (_) { }
      child = null;
    }
    stdinQueue = [];
    if (runDir && fs.existsSync(runDir)) {
      const d = runDir;
      runDir = '';
      setTimeout(() => {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {
          setTimeout(() => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (__) { } }, 1200);
        }
      }, 250);
    }
  };

  const writeStdin = (data: string) => {
    if (child?.stdin?.writable) {
      child.stdin.write(data);
    } else {
      stdinQueue.push(data);
    }
  };

  const flushStdinQueue = () => {
    if (!child?.stdin?.writable) return;
    while (stdinQueue.length > 0) {
      child.stdin.write(stdinQueue.shift()!);
    }
  };

  // Send a friendly "not installed" message and exit
  const notInstalled = (lang: string, hint: string) => {
    send('stderr', `\r\n\x1b[31m${lang} is not installed on this server.\x1b[0m\r\n`);
    send('stderr', `\x1b[33mTo install: ${hint}\x1b[0m\r\n`);
    send('exit', 1);
    cleanup();
  };

  const startProcess = (command: string, args: string[], cwd: string) => {
    try {
      const resolved = resolveCmd(command);
      const useShell = process.platform === 'win32' && (resolved.endsWith('.cmd') || resolved.endsWith('.bat'));
      child = spawn(resolved, args, { cwd, env: BASE_ENV, shell: useShell });

      flushStdinQueue();

      child.stdout?.on('data', (d) => send('stdout', d.toString()));
      child.stderr?.on('data', (d) => send('stderr', d.toString()));

      child.on('close', (code) => {
        send('exit', code ?? 0);
        cleanup();
      });

      child.on('error', (err) => {
        send('stderr', `Failed to start: ${err.message}\r\n`);
        send('exit', 1);
        cleanup();
      });

      timeoutId = setTimeout(() => {
        if (child) {
          send('stderr', '\r\nExecution timed out (60 seconds)\r\n');
          cleanup();
        }
      }, 60_000);

    } catch (err: any) {
      send('stderr', `Process spawn failed: ${err.message}\r\n`);
      send('exit', 1);
      cleanup();
    }
  };

  const compile = (compiler: string, args: string[], cwd: string, onSuccess: () => void) => {
    try {
      const resolved = resolveCmd(compiler);
      const useShell = process.platform === 'win32' && (resolved.endsWith('.cmd') || resolved.endsWith('.bat'));
      const compChild = spawn(resolved, args, { cwd, env: BASE_ENV, shell: useShell });

      let output = '';
      compChild.stdout?.on('data', (d) => (output += d.toString()));
      compChild.stderr?.on('data', (d) => (output += d.toString()));

      compChild.on('close', (code) => {
        if (code !== 0) {
          send('stderr', output.replace(/\n/g, '\r\n'));
          send('exit', code ?? 1);
          cleanup();
        } else {
          onSuccess();
        }
      });

      compChild.on('error', (err) => {
        send('stderr', `Compiler failed: ${err.message}\r\n`);
        send('exit', 1);
        cleanup();
      });

      timeoutId = setTimeout(() => {
        try { compChild.kill('SIGKILL'); } catch (_) { }
        send('stderr', '\r\nCompilation timed out (30 seconds)\r\n');
        cleanup();
      }, 30_000);

    } catch (err: any) {
      send('stderr', `Compiler spawn failed: ${err.message}\r\n`);
      send('exit', 1);
      cleanup();
    }
  };

  // ── Message handler ────────────────────────────────────────────────────────
  ws.on('message', async (message: string) => {
    try {
      const payload = JSON.parse(message);

      // ── RUN ─────────────────────────────────────────────────────────────────
      if (payload.type === 'run') {
        cleanup();

        const { language, code } = payload;
        const lang = (language as string).toLowerCase();
        const isDocker = checkDockerAvailable();

        if (isDocker) {
          // ── Docker path ─────────────────────────────────────────────────────
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
              const phpReqs = [...phpCode.matchAll(/\/\/\s*composer\s+require\s+([a-zA-Z0-9_\-\/]+)/gi)].map(m => m[1]);
              if (phpReqs.length > 0 && !phpCode.includes('vendor/autoload.php')) {
                phpCode = phpCode.replace(/<\?php/i, '<?php\nrequire_once __DIR__ . "/vendor/autoload.php";\n');
              }
              const inlineB64 = Buffer.from(phpCode).toString('base64');
              if (phpReqs.length > 0) {
                runCmd = `echo ${inlineB64} | base64 -d > main.php && composer require ${phpReqs.join(' ')} --quiet && php main.php`;
              } else {
                runCmd = `echo ${inlineB64} | base64 -d > main.php && php main.php`;
              }
              break;
            }
            case 'rust':
              runCmd = 'echo $CODE_B64 | base64 -d > main.rs && rustc main.rs -o main && ./main';
              break;
            default:
              send('stderr', `Unsupported language: ${language}\r\n`);
              send('exit', 1);
              return;
          }

          const imageName = process.env.DOCKER_IMAGE || 'compiler-runner';
          startProcess('docker', [
            'run', '--rm', '-i', '--net=none',
            '--memory=256m', '--cpus=0.5',
            '-e', `CODE_B64=${codeB64}`,
            imageName, 'sh', '-c', runCmd
          ], os.tmpdir());
          return;
        }

        // ── Native host path ─────────────────────────────────────────────────
        const id = crypto.randomUUID();
        runDir = path.join(RUNS_DIR, id);
        fs.mkdirSync(runDir, { recursive: true });

        const execExt = process.platform === 'win32' ? '.exe' : '';
        const binaryPath = path.join(runDir, 'main' + execExt);

        switch (lang) {
          // ── C ───────────────────────────────────────────────────────────────
          case 'c': {
            if (!compilerExists('gcc')) { notInstalled('GCC (C compiler)', 'Install Dev-C++ or MinGW'); return; }
            const src = path.join(runDir, 'main.c');
            fs.writeFileSync(src, injectStdoutUnbuffering(code, 'c'));
            compile('gcc', ['-std=c11', '-O2', '-Wall', '-o', binaryPath, 'main.c'], runDir, () => {
              startProcess(binaryPath, [], runDir);
            });
            break;
          }

          // ── C++ ─────────────────────────────────────────────────────────────
          case 'cpp': {
            if (!compilerExists('g++')) { notInstalled('G++ (C++ compiler)', 'Install Dev-C++ or MinGW'); return; }
            const src = path.join(runDir, 'main.cpp');
            fs.writeFileSync(src, injectStdoutUnbuffering(code, 'cpp'));
            compile('g++', ['-std=c++14', '-O2', '-Wall', '-o', binaryPath, 'main.cpp'], runDir, () => {
              startProcess(binaryPath, [], runDir);
            });
            break;
          }

          // ── Python ──────────────────────────────────────────────────────────
          case 'python': {
            const pyCmd = getPythonCmd();
            if (!compilerExists(pyCmd)) { notInstalled('Python', 'Download from https://python.org'); return; }
            const src = path.join(runDir, 'main.py');
            fs.writeFileSync(src, code);
            startProcess(pyCmd, ['-u', 'main.py'], runDir);
            break;
          }

          // ── Java ────────────────────────────────────────────────────────────
          case 'java': {
            if (!compilerExists('javac')) { notInstalled('Java JDK', 'Download from https://adoptium.net'); return; }
            const className = getJavaClassName(code);
            const src = path.join(runDir, `${className}.java`);
            fs.writeFileSync(src, code);
            compile('javac', [`${className}.java`], runDir, () => {
              startProcess('java', ['-cp', runDir, className], runDir);
            });
            break;
          }

          // ── JavaScript ──────────────────────────────────────────────────────
          case 'javascript':
          case 'node': {
            const src = path.join(runDir, 'main.js');
            fs.writeFileSync(src, code);
            startProcess('node', ['main.js'], runDir);
            break;
          }

          // ── TypeScript ──────────────────────────────────────────────────────
          case 'typescript': {
            // Strip conflicting 'declare var' for globals TypeScript already declares (TS 4.4+ includes console, etc.)
            const builtinGlobals = ['require', 'process', 'console', 'module', '__dirname', '__filename', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];
            const cleanCode = code.split('\n').filter((line: string) => {
              const trimmed = line.trim();
              return !builtinGlobals.some(g => trimmed === `declare var ${g}: any;` || trimmed === `declare var ${g}: any`);
            }).join('\n');
            const src = path.join(runDir, 'main.ts');
            fs.writeFileSync(src, cleanCode);
            const localTsc = path.resolve(__dirname, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
            // Write tsconfig in runDir so tsc doesn't conflict with files on commandline
            const tscfg = JSON.stringify({
              compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                strict: false,
                esModuleInterop: true,
                skipLibCheck: true,
                outDir: '.',
                noEmitOnError: false,
                types: [],
                typeRoots: []
              },
              files: ['main.ts']
            });
            fs.writeFileSync(path.join(runDir, 'tsconfig.json'), tscfg);
            compile('node', [localTsc, '--project', path.join(runDir, 'tsconfig.json')], runDir, () => {
              startProcess('node', ['main.js'], runDir);
            });
            break;
          }

          // ── C# ──────────────────────────────────────────────────────────────
          case 'csharp': {
            if (!compilerExists('dotnet')) { notInstalled('.NET SDK', 'Download from https://dotnet.microsoft.com/download'); return; }
            const csprojPath = path.join(runDir, 'main.csproj');
            fs.writeFileSync(csprojPath, CS_PROJ_CONTENT);
            const programPath = path.join(runDir, 'Program.cs');
            fs.writeFileSync(programPath, code);
            compile('dotnet', ['restore'], runDir, () => {
              startProcess('dotnet', ['run', '--project', 'main.csproj', '--configuration', 'Release'], runDir);
            });
            break;
          }

          // ── Go ──────────────────────────────────────────────────────────────
          case 'go': {
            if (!compilerExists('go')) { notInstalled('Go', 'Download from https://go.dev/dl/'); return; }
            const src = path.join(runDir, 'main.go');
            fs.writeFileSync(src, code);
            startProcess('go', ['run', 'main.go'], runDir);
            break;
          }

          // ── PHP ─────────────────────────────────────────────────────────────
          case 'php': {
            if (!compilerExists('php')) { notInstalled('PHP', 'Download from https://www.php.net/downloads'); return; }
            const src = path.join(runDir, 'main.php');
            let phpCode = code;
            if (!phpCode.trim().startsWith('<?php')) {
              phpCode = '<?php\n' + phpCode;
            }
            
            const composerRequires = [...phpCode.matchAll(/\/\/\s*composer\s+require\s+([a-zA-Z0-9_\-\/]+)/gi)].map(m => m[1]);
            if (composerRequires.length > 0 && !phpCode.includes('vendor/autoload.php')) {
              phpCode = phpCode.replace(/<\?php/i, '<?php\nrequire_once __DIR__ . "/vendor/autoload.php";\n');
            }
            
            fs.writeFileSync(src, phpCode);

            if (composerRequires.length > 0) {
              if (!compilerExists('composer')) { notInstalled('Composer', 'Install Composer from https://getcomposer.org/'); return; }
              compile('composer', ['require', ...composerRequires, '--quiet'], runDir, () => {
                startProcess('php', ['main.php'], runDir);
              });
            } else {
              startProcess('php', ['main.php'], runDir);
            }
            break;
          }

          // ── Rust ────────────────────────────────────────────────────────────
          case 'rust': {
            if (!compilerExists('rustc')) { notInstalled('Rust', 'Install from https://rustup.rs/'); return; }
            const src = path.join(runDir, 'main.rs');
            fs.writeFileSync(src, code);
            compile('rustc', ['main.rs', '-C', 'linker=rust-lld', '-o', binaryPath], runDir, () => {
              startProcess(binaryPath, [], runDir);
            });
            break;
          }

          default:
            send('stderr', `Unsupported language: ${language}\r\n`);
            send('exit', 1);
            cleanup();
        }

        // ── STDIN ──────────────────────────────────────────────────────────────
      } else if (payload.type === 'stdin') {
        writeStdin(payload.data);

        // ── STOP ───────────────────────────────────────────────────────────────
      } else if (payload.type === 'stop') {
        cleanup();
        send('exit', 0);
      }

    } catch (err: any) {
      console.error('WS message error:', err);
      send('stderr', `Error: ${err.message || 'Unknown error'}\r\n`);
      send('exit', 1);
      cleanup();
    }
  });

  ws.on('error', (err) => { console.error('WS error:', err); cleanup(); });
  ws.on('close', cleanup);
}
