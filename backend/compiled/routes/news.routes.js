"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const news_controller_1 = require("../controllers/news.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const createNewsValidation = [
    (0, express_validator_1.body)('headline').trim().notEmpty().withMessage('Headline is required'),
    (0, express_validator_1.body)('category')
        .isIn(['DEVELOPMENT_WORK', 'CONSPIRACY_FAKE_NEWS', 'LEADER_ACTIVITY', 'PARTY_ACTIVITY', 'OPPOSITION', 'OTHER'])
        .withMessage('Valid category is required'),
    (0, express_validator_1.body)('priority')
        .optional()
        .isIn(['NORMAL', 'HIGH', 'CRITICAL'])
        .withMessage('Invalid priority level'),
    (0, express_validator_1.body)('mediaSource').trim().notEmpty().withMessage('Media source is required'),
    (0, express_validator_1.body)('region').trim().notEmpty().withMessage('Region is required'),
];
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid news ID'),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Staff can create news
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createNewsValidation), news_controller_1.createNews);
// Get all news
router.get('/', news_controller_1.getNews);
// Get critical alerts
router.get('/alerts/critical', news_controller_1.getCriticalAlerts);
// Get single news
router.get('/:id', (0, validate_1.validate)(idParamValidation), news_controller_1.getNewsById);
// Update news
router.put('/:id', (0, validate_1.validate)(idParamValidation), news_controller_1.updateNews);
// Delete news (admin only)
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), news_controller_1.deleteNews);
exports.default = router;
//# sourceMappingURL=news.routes.js.map