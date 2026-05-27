import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import runRoutes from './routes/run.routes';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://compilar.vercel.app'],
  credentials: true
}));
app.use(express.json());

app.use('/api', runRoutes);

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler middleware (catches errors from routes/middleware)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

export { app };
