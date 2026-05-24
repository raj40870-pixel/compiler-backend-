const { spawn } = require('child_process');
const os = require('os');

const MINGW_PATHS = [
  'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
  'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
  'C:\\MinGW\\bin',
  'C:\\msys64\\mingw64\\bin',
];

const EXTRA_PATHS = [
  ...MINGW_PATHS,
  'C:\\Python312', 'C:\\Python311', 'C:\\Python310',
  `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python312`,
  `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python311`,
  `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python310`,
];

const ENRICHED_PATH = [
  ...EXTRA_PATHS,
  ...(process.env.PATH || '').split(';').filter(p => !p.toLowerCase().includes('windowsapps')),
].join(';');

process.env.PATH = ENRICHED_PATH;

const commands = [
  { name: 'gcc', args: ['--version'] },
  { name: 'g++', args: ['--version'] },
  { name: 'python', args: ['--version'] },
  { name: 'python3', args: ['--version'] },
  { name: 'node', args: ['--version'] },
  { name: 'java', args: ['--version'] },
  { name: 'javac', args: ['--version'] },
  { name: 'tsc', args: ['--version'] },
  { name: 'go', args: ['version'] },
  { name: 'rustc', args: ['--version'] },
  { name: 'php', args: ['--version'] },
  { name: 'csc', args: ['/version'] },
  { name: 'mcs', args: ['--version'] },
  { name: 'dotnet', args: ['--version'] },
];

function checkCommand(cmd) {
  return new Promise((resolve) => {
    const proc = spawn(cmd.name, cmd.args, { shell: true });
    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { output += d; });
    proc.on('close', (code) => {
      resolve({
        name: cmd.name,
        available: code === 0 || output.length > 0,
        output: output.trim().split('\n')[0],
      });
    });
    proc.on('error', () => {
      resolve({ name: cmd.name, available: false, output: 'Not found' });
    });
  });
}

(async () => {
  console.log('Checking compilers on path...');
  const results = [];
  for (const cmd of commands) {
    results.push(await checkCommand(cmd));
  }
  console.log(JSON.stringify(results, null, 2));
})();
