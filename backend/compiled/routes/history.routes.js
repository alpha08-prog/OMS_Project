"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const history_controller_1 = require("../controllers/history.controller");
const router = (0, express_1.Router)();
// All history routes require authentication and admin+ role
router.use(auth_1.authenticate);
router.use(auth_1.adminOnly);
// GET /api/history - Get all admin action history
// Query params: type (GRIEVANCE, TRAIN_REQUEST, TOUR_PROGRAM), action, startDate, endDate, page, limit
router.get('/', history_controller_1.getAdminHistory);
// GET /api/history/stats - Get history statistics
router.get('/stats', history_controller_1.getHistoryStats);
exports.default = router;
//# sourceMappingURL=history.routes.js.map