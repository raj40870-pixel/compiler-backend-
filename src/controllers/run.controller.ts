import { Request, Response } from 'express';
import { CodeRunnerService } from '../utils/codeRunner.service';

export const runCode = async (req: Request, res: Response) => {
  const { code, language, input } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }

  try {
    const startTime = Date.now();
    const result = await CodeRunnerService.execute(code, language, input);
    const endTime = Date.now();
    
    const executionTime = (endTime - startTime).toString();

    res.json({
      output: result.stdout,
      error: result.stderr,
      time: executionTime
    });
  } catch (error: any) {
    console.error('Execution Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during execution' });
  }
};
