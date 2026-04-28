/**
 * Multer config for attachment uploads.
 *
 * In-memory storage (not disk) -- the AppSail container is ephemeral and
 * read-only, plus we want to forward the buffer straight to Stratus rather
 * than touch local FS. Limit: 10 MB per file. Allowed: images + PDF.
 */
import multer from 'multer';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
]);

function isAllowedMime(mime: string): boolean {
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMime(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(
      new Error(
        `Unsupported file type "${file.mimetype}". Allowed: images and PDF.`
      )
    );
  },
}).single('file');
