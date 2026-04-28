import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import {
  uploadFile,
  downloadFile,
  deleteFile,
} from '../controllers-catalyst/upload.controller';
import { sendError } from '../utils/response';

const router = Router();

router.use(authenticate);

// Wrap multer so its errors (size limit, MIME filter) become a friendly 400
// instead of bubbling up as a 500. Multer puts the error on the next() call.
function multerErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    sendError(res, 'File too large. Max 10 MB.', 413);
    return;
  }
  if (err.message) {
    sendError(res, err.message, 400);
    return;
  }
  next(err);
}

router.post(
  '/',
  (req, res, next) => uploadSingle(req, res, (err) => multerErrorHandler(err, req, res, next)),
  uploadFile
);

router.get('/:id', downloadFile);
router.delete('/:id', deleteFile);

export default router;
