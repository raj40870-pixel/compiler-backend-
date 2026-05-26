export declare const BASE_ENV: NodeJS.ProcessEnv;
export declare function checkDockerAvailable(): boolean;
export declare function getPythonCmd(): string;
export declare function getJavaClassName(code: string): string;
export declare function injectStdoutUnbuffering(code: string, lang: 'c' | 'cpp'): string;
export declare const CS_PROJ_CONTENT = "<Project Sdk=\"Microsoft.NET.Sdk\">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n    <ImplicitUsings>enable</ImplicitUsings>\n    <Nullable>disable</Nullable>\n    <WarningLevel>0</WarningLevel>\n  </PropertyGroup>\n</Project>";
export declare function resolveCmd(cmd: string): string;
export declare function getTsNodeCmd(): string;
export declare const TS_CONFIG_CONTENT: string;
export declare function compilerExists(cmd: string): boolean;
//# sourceMappingURL=runnerHelper.d.ts.map