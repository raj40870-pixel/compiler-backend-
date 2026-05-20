interface ExecutionResult {
    stdout: string;
    stderr: string;
}
export declare class CodeRunnerService {
    static execute(code: string, language: string, input?: string): Promise<ExecutionResult>;
}
export {};
//# sourceMappingURL=codeRunner.service.d.ts.map