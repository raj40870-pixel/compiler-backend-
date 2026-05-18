import { app } from './app';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleWsConnection } from './utils/wsRunner';

const PORT = process.env.PORT || 8080;

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/run' });

wss.on('connection', (ws) => {
  handleWsConnection(ws);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

