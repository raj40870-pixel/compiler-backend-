"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CS_PROJ_CONTENT = exports.BASE_ENV = void 0;
exports.checkDockerAvailable = checkDockerAvailable;
exports.getPythonCmd = getPythonCmd;
exports.getJavaClassName = getJavaClassName;
exports.injectStdoutUnbuffering = injectStdoutUnbuffering;
exports.resolveCmd = resolveCmd;
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
// Enriched PATH to find compilers/runtimes on Windows host
const EXTRA_PATHS = [
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
    'C:\\Program Files\\Go\\bin',
    `C:\\Users\\${os_1.default.userInfo().username}\\.cargo\\bin`,
    'C:\\php',
    'C:\\tools\\php84',
    'C:\\tools\\php83',
];
const ENRICHED_PATH = [
    ...EXTRA_PATHS,
    ...(process.env.PATH || '').split(';').filter(p => !p.toLowerCase().includes('windowsapps')),
].join(';');
exports.BASE_ENV = {
    ...process.env,
    PATH: ENRICHED_PATH,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
};
// Cache Docker availability
let isDockerAvailableCache = null;
function checkDockerAvailable() {
    if (isDockerAvailableCache !== null) {
        return isDockerAvailableCache;
    }
    try {
        // Run a quick check
        (0, child_process_1.execSync)('docker ps', { stdio: 'ignore' });
        isDockerAvailableCache = true;
    }
    catch {
        isDockerAvailableCache = false;
    }
    return isDockerAvailableCache;
}
// Get the correct python binary name on host
let cachedPythonCmd = null;
function getPythonCmd() {
    if (cachedPythonCmd)
        return cachedPythonCmd;
    try {
        (0, child_process_1.execSync)('python3 --version', { stdio: 'ignore', env: exports.BASE_ENV });
        cachedPythonCmd = 'python3';
    }
    catch {
        try {
            (0, child_process_1.execSync)('python --version', { stdio: 'ignore', env: exports.BASE_ENV });
            cachedPythonCmd = 'python';
        }
        catch {
            cachedPythonCmd = 'python3';
        }
    }
    return cachedPythonCmd;
}
// Extract Java public class name
function getJavaClassName(code) {
    const match = code.match(/public\s+class\s+(\w+)/);
    return match?.[1] ?? 'Main';
}
// Inject C/C++ stdout unbuffering
function injectStdoutUnbuffering(code, lang) {
    if (code.includes('setvbuf') || code.includes('setbuf')) {
        return code;
    }
    const mainRegex = /(\bmain\s*\([^)]*\)\s*\{)/;
    if (mainRegex.test(code)) {
        let modifiedCode = code.replace(mainRegex, '$1\n    setvbuf(stdout, NULL, _IONBF, 0);');
        if (lang === 'c') {
            if (!modifiedCode.includes('<stdio.h>')) {
                modifiedCode = `#include <stdio.h>\n${modifiedCode}`;
            }
        }
        else {
            if (!modifiedCode.includes('<cstdio>') && !modifiedCode.includes('<stdio.h>')) {
                modifiedCode = `#include <cstdio>\n${modifiedCode}`;
            }
        }
        return modifiedCode;
    }
    return code;
}
// C# minimal csproj XML content
exports.CS_PROJ_CONTENT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;
// Resolve cmd wrapper for Windows
function resolveCmd(cmd) {
    if (process.platform === 'win32') {
        if (cmd === 'npx')
            return 'npx.cmd';
        if (cmd === 'npm')
            return 'npm.cmd';
        if (cmd === 'ts-node')
            return 'ts-node.cmd';
    }
    return cmd;
}
//# sourceMappingURL=runnerHelper.js.map