import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
//  PATH enrichment — ensure all host compilers are discoverable
// ─────────────────────────────────────────────────────────────────────────────
const USERNAME = os.userInfo().username;

const EXTRA_PATHS = [
  // Node.js
  'C:\\Program Files\\nodejs',

  // Java (Eclipse Adoptium / Temurin JDK)
  'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.18.8-hotspot\\bin',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.0.35-hotspot\\bin',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin',
  'C:\\Program Files\\Java\\jdk-17\\bin',
  'C:\\Program Files\\Java\\jdk-21\\bin',
  'C:\\Program Files\\Java\\jdk-17.0.0\\bin',

  // C / C++ — Dev-C++ MinGW64
  'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
  'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
  'C:\\MinGW\\bin',
  'C:\\msys64\\mingw64\\bin',
  'C:\\msys64\\usr\\bin',

  // Python
  `C:\\Users\\${USERNAME}\\AppData\\Local\\Programs\\Python\\Python312`,
  `C:\\Users\\${USERNAME}\\AppData\\Local\\Programs\\Python\\Python311`,
  `C:\\Users\\${USERNAME}\\AppData\\Local\\Programs\\Python\\Python310`,
  'C:\\Python312',
  'C:\\Python311',
  'C:\\Python310',

  // Go
  'C:\\Program Files\\Go\\bin',
  `C:\\Users\\${USERNAME}\\go\\bin`,

  // Rust
  `C:\\Users\\${USERNAME}\\.cargo\\bin`,

  // PHP
  'C:\\php',
  'C:\\tools\\php84',
  'C:\\tools\\php83',
  'C:\\tools\\php82',
  'C:\\xampp\\php',

  // Composer
  'C:\\ProgramData\\ComposerSetup\\bin',
  `C:\\Users\\${USERNAME}\\AppData\\Roaming\\Composer\\vendor\\bin`,

  // .NET
  'C:\\Program Files\\dotnet',
];

const ENRICHED_PATH = [
  ...EXTRA_PATHS,
  ...(process.env.PATH || '').split(';').filter(p => p && !p.toLowerCase().includes('windowsapps')),
].join(';');

export const BASE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: ENRICHED_PATH,
  PYTHONIOENCODING: 'utf-8',
  PYTHONUNBUFFERED: '1',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Docker availability (cached)
// ─────────────────────────────────────────────────────────────────────────────
let isDockerAvailableCache: boolean | null = null;

export function checkDockerAvailable(): boolean {
  if (isDockerAvailableCache !== null) return isDockerAvailableCache;
  try {
    execSync('docker ps', { stdio: 'ignore', timeout: 3000 });
    isDockerAvailableCache = true;
  } catch {
    isDockerAvailableCache = false;
  }
  return isDockerAvailableCache;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Python command resolution (cached)
// ─────────────────────────────────────────────────────────────────────────────
let cachedPythonCmd: string | null = null;

export function getPythonCmd(): string {
  if (cachedPythonCmd) return cachedPythonCmd;
  for (const cmd of ['python3', 'python']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', env: BASE_ENV, timeout: 3000 });
      cachedPythonCmd = cmd;
      return cachedPythonCmd;
    } catch { /* try next */ }
  }
  cachedPythonCmd = 'python';
  return cachedPythonCmd;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Java class name extraction
// ─────────────────────────────────────────────────────────────────────────────
export function getJavaClassName(code: string): string {
  const match = code.match(/public\s+class\s+(\w+)/);
  return match?.[1] ?? 'Main';
}

// ─────────────────────────────────────────────────────────────────────────────
//  C / C++ — inject stdout unbuffering so output appears immediately
// ─────────────────────────────────────────────────────────────────────────────
export function injectStdoutUnbuffering(code: string, lang: 'c' | 'cpp'): string {
  if (code.includes('setvbuf') || code.includes('setbuf')) return code;

  const mainRegex = /(\bmain\s*\([^)]*\)\s*\{)/;
  if (mainRegex.test(code)) {
    let modified = code.replace(mainRegex, '$1\n    setvbuf(stdout, NULL, _IONBF, 0);');
    if (lang === 'c') {
      if (!modified.includes('<stdio.h>')) modified = `#include <stdio.h>\n${modified}`;
    } else {
      if (!modified.includes('<cstdio>') && !modified.includes('<stdio.h>'))
        modified = `#include <cstdio>\n${modified}`;
    }
    return modified;
  }
  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
//  C# minimal .csproj
// ─────────────────────────────────────────────────────────────────────────────
export const CS_PROJ_CONTENT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>disable</Nullable>
    <WarningLevel>0</WarningLevel>
  </PropertyGroup>
</Project>`;

// ─────────────────────────────────────────────────────────────────────────────
//  Windows command wrapper (.cmd suffix for npm scripts)
// ─────────────────────────────────────────────────────────────────────────────
export function resolveCmd(cmd: string): string {
  if (process.platform === 'win32') {
    if (cmd === 'npx') return 'npx.cmd';
    if (cmd === 'npm') return 'npm.cmd';
    if (cmd === 'ts-node') return 'ts-node.cmd';
    if (cmd === 'composer') return 'composer.bat';
  }
  return cmd;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Absolute path to ts-node inside this backend's node_modules
// ─────────────────────────────────────────────────────────────────────────────
export function getTsNodeCmd(): string {
  const bin = process.platform === 'win32' ? 'ts-node.cmd' : 'ts-node';
  // __dirname is backend/src/utils — go up to backend/, then into node_modules
  const local = path.resolve(__dirname, '..', '..', 'node_modules', '.bin', bin);
  if (fs.existsSync(local)) return local;

  // Fallback: look in the monorepo root node_modules
  const root = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', bin);
  if (fs.existsSync(root)) return root;

  // Last resort: npx
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal tsconfig.json to drop in the temp run directory for TypeScript
// ─────────────────────────────────────────────────────────────────────────────
export const TS_CONFIG_CONTENT = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'commonjs',
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
//  Check whether a compiler binary is reachable in the enriched PATH
// ─────────────────────────────────────────────────────────────────────────────
export function compilerExists(cmd: string): boolean {
  try {
    const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(check, { stdio: 'ignore', env: BASE_ENV, timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
