interface ExecutionResult {
    stdout: string;
    stderr: string;
}
export declare class CodeRunnerService {
    static execute(code: string, language: string, input?: string): Promise<ExecutionResult>;
    private static runCommand;
    private static runC;
    private static runCpp;
    private static runPython;
    private static runJava;
    private static runNode;
}
export {};
//# sourceMappingURL=codeRunner.service.d.ts.map