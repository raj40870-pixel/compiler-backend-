import { app } from './app';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleWsConnection } from './utils/wsRunner';

const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────────────────
//  Global Error Handlers (prevents FUNCTION_INVOCATION_FAILED on Vercel)
// ─────────────────────────────────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
  // Log but don't exit for unhandled rejections (allows server to recover)
  // If critical, exit anyway
  if (process.env.EXIT_ON_UNHANDLED_REJECTION === 'true') {
    process.exit(1);
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/run' });

wss.on('connection', (ws) => {
  handleWsConnection(ws);
});

// Global WebSocket error handler
wss.on('error', (error) => {
  console.error('WebSocketServer error:', error);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

