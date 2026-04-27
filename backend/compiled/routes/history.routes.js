"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const history_controller_1 = require("../controllers-catalyst/history.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(auth_1.adminOnly);
router.get('/', history_controller_1.getAdminHistory);
router.get('/stats', history_controller_1.getHistoryStats);
exports.default = router;
//# sourceMappingURL=history.routes.js.map