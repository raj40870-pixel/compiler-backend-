import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import runRoutes from './routes/run.routes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', runRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export { app };
