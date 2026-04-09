"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const grievance_routes_1 = __importDefault(require("./grievance.routes"));
const visitor_routes_1 = __importDefault(require("./visitor.routes"));
const news_routes_1 = __importDefault(require("./news.routes"));
const trainRequest_routes_1 = __importDefault(require("./trainRequest.routes"));
const tourProgram_routes_1 = __importDefault(require("./tourProgram.routes"));
const stats_routes_1 = __importDefault(require("./stats.routes"));
const pdf_routes_1 = __importDefault(require("./pdf.routes"));
const birthday_routes_1 = __importDefault(require("./birthday.routes"));
const history_routes_1 = __importDefault(require("./history.routes"));
const task_routes_1 = __importDefault(require("./task.routes"));
const google_routes_1 = __importDefault(require("./google.routes"));
const router = (0, express_1.Router)();
// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'OMS API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});
// Mount routes
router.use('/auth', auth_routes_1.default);
router.use('/grievances', grievance_routes_1.default);
router.use('/visitors', visitor_routes_1.default);
router.use('/news', news_routes_1.default);
router.use('/train-requests', trainRequest_routes_1.default);
router.use('/tour-programs', tourProgram_routes_1.default);
router.use('/stats', stats_routes_1.default);
router.use('/pdf', pdf_routes_1.default);
router.use('/birthdays', birthday_routes_1.default);
router.use('/history', history_routes_1.default);
router.use('/tasks', task_routes_1.default);
router.use('/google', google_routes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map