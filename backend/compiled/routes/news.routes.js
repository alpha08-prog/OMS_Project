"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const news_controller_1 = require("../controllers-catalyst/news.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
const createNewsValidation = [
    (0, express_validator_1.body)('headline').trim().notEmpty().withMessage('Headline is required'),
    (0, express_validator_1.body)('category')
        .isIn([
        'DEVELOPMENT_WORK',
        'CONSPIRACY_FAKE_NEWS',
        'LEADER_ACTIVITY',
        'PARTY_ACTIVITY',
        'OPPOSITION',
        'OTHER',
    ])
        .withMessage('Valid category is required'),
    (0, express_validator_1.body)('priority')
        .optional()
        .isIn(['NORMAL', 'HIGH', 'CRITICAL'])
        .withMessage('Invalid priority level'),
    (0, express_validator_1.body)('mediaSource').trim().notEmpty().withMessage('Media source is required'),
    (0, express_validator_1.body)('region').trim().notEmpty().withMessage('Region is required'),
];
const idParamValidation = [
    (0, express_validator_1.param)('id')
        .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
        .withMessage('Invalid news ID'),
];
router.use(auth_1.authenticate);
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createNewsValidation), news_controller_1.createNews);
router.get('/', news_controller_1.getNews);
router.get('/alerts/critical', news_controller_1.getCriticalAlerts);
router.get('/:id', (0, validate_1.validate)(idParamValidation), news_controller_1.getNewsById);
router.put('/:id', (0, validate_1.validate)(idParamValidation), news_controller_1.updateNews);
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), news_controller_1.deleteNews);
exports.default = router;
//# sourceMappingURL=news.routes.js.map