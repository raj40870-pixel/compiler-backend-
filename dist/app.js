"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const run_routes_1 = __importDefault(require("./routes/run.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://compilar.vercel.app'],
    credentials: true
}));
app.use(express_1.default.json());
app.use('/api', run_routes_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
//# sourceMappingURL=app.js.map