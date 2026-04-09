"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const express_validator_1 = require("express-validator");
/**
 * Middleware to run validation chains and return errors
 */
function validate(validations) {
    return async (req, res, next) => {
        // Run all validations
        await Promise.all(validations.map((validation) => validation.run(req)));
        const errors = (0, express_validator_1.validationResult)(req);
        if (errors.isEmpty()) {
            next();
            return;
        }
        const formattedErrors = errors.array().map((err) => ({
            field: 'path' in err ? err.path : 'unknown',
            message: err.msg,
        }));
        res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors: formattedErrors,
        });
    };
}
//# sourceMappingURL=validate.js.map