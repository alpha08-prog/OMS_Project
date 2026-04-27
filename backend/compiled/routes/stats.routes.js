"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stats_controller_1 = require("../controllers-catalyst/stats.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/summary', auth_1.adminOnly, stats_controller_1.getDashboardSummary);
router.get('/grievances/by-type', auth_1.adminOnly, stats_controller_1.getGrievancesByType);
router.get('/grievances/by-status', auth_1.adminOnly, stats_controller_1.getGrievancesByStatus);
router.get('/grievances/by-constituency', auth_1.adminOnly, stats_controller_1.getGrievancesByConstituency);
router.get('/grievances/monthly', auth_1.adminOnly, stats_controller_1.getMonthlyGrievanceTrends);
router.get('/monetization', auth_1.superAdminOnly, stats_controller_1.getMonetizationSummary);
router.get('/recent-activity', auth_1.adminOnly, stats_controller_1.getRecentActivity);
exports.default = router;
//# sourceMappingURL=stats.routes.js.map