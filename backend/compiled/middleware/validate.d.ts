import { Request, Response, NextFunction } from 'express';
import { ValidationChain } from 'express-validator';
/**
 * Middleware to run validation chains and return errors
 */
export declare function validate(validations: ValidationChain[]): (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=validate.d.ts.map