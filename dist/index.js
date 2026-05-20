"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const http_1 = require("http");
const ws_1 = require("ws");
const wsRunner_1 = require("./utils/wsRunner");
const PORT = process.env.PORT || 3000;
const server = (0, http_1.createServer)(app_1.app);
const wss = new ws_1.WebSocketServer({ server, path: '/ws/run' });
wss.on('connection', (ws) => {
    (0, wsRunner_1.handleWsConnection)(ws);
});
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map