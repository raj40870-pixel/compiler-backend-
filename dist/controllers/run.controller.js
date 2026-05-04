"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCode = void 0;
const codeRunner_service_1 = require("../utils/codeRunner.service");
const runCode = async (req, res) => {
    const { code, language, input } = req.body;
    if (!code || !language) {
        return res.status(400).json({ error: 'Code and language are required' });
    }
    try {
        const startTime = Date.now();
        const result = await codeRunner_service_1.CodeRunnerService.execute(code, language, input);
        const endTime = Date.now();
        const executionTime = (endTime - startTime).toString();
        res.json({
            output: result.stdout,
            error: result.stderr,
            time: executionTime
        });
    }
    catch (error) {
        console.error('Execution Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error during execution' });
    }
};
exports.runCode = runCode;
//# sourceMappingURL=run.controller.js.map