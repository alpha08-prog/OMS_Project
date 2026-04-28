/**
 * Attachment / upload controller -- Catalyst-backed.
 *
 * Files live in Stratus (Catalyst object store). Metadata lives in the
 * Attachment Data Store table. Two are joined by `stratusKey`.
 *
 * Flow:
 *   POST /api/uploads        -- accepts multipart, uploads to Stratus,
 *                                inserts Attachment row, returns metadata.
 *   GET  /api/uploads/:id    -- redirects to a 5-min pre-signed Stratus URL.
 *   DELETE /api/uploads/:id  -- removes Stratus object + Attachment row.
 */
import { Request, Response } from 'express';
import {
  uploadObject,
  deleteObject,
  getSignedDownloadUrl,
  buildObjectKey,
} from '../lib/stratus';
import { getRow, insertRow, deleteRow, CatalystRow } from '../lib/catalyst-client';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendForbidden,
  sendServerError,
} from '../utils/response';
import type { AuthenticatedRequest } from '../types';

const ATTACHMENT_TABLE = 'Attachment';

const ALLOWED_CONTEXTS = new Set([
  'GRIEVANCE',
  'TOUR',
  'NEWS',
  'PHOTO_BOOTH',
]);

type RequestWithFile = AuthenticatedRequest & { file?: Express.Multer.File };

function shapeAttachment(row: CatalystRow) {
  return {
    id: String(row.ROWID),
    contextType: String(row.contextType ?? ''),
    contextId: row.contextId ? String(row.contextId) : null,
    filename: String(row.filename ?? ''),
    mimeType: String(row.mimeType ?? ''),
    size: Number(row.size ?? 0),
    uploaderId: row.uploaderId ? String(row.uploaderId) : null,
    createdAt: row.CREATEDTIME ?? null,
    // The download URL is intentionally a backend route, not a direct
    // Stratus URL. Each call regenerates a fresh short-lived signed URL,
    // so leaked URLs expire and access can be revoked by deleting the row.
    url: `/api/uploads/${String(row.ROWID)}`,
  };
}

/** POST /api/uploads */
export async function uploadFile(
  req: RequestWithFile,
  res: Response
): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'No file provided. Use form field "file".', 400);
      return;
    }

    const contextTypeRaw = String(req.body?.contextType ?? '').toUpperCase().trim();
    if (!ALLOWED_CONTEXTS.has(contextTypeRaw)) {
      sendError(
        res,
        `Invalid contextType. Must be one of: ${Array.from(ALLOWED_CONTEXTS).join(', ')}`,
        400
      );
      return;
    }

    const contextIdRaw = req.body?.contextId;
    const contextId = contextIdRaw ? String(contextIdRaw).trim() : null;

    const stratusKey = buildObjectKey(contextTypeRaw, contextId, req.file.originalname);

    // Upload to Stratus first. If the DB insert below fails, we'd rather
    // have an orphan object in the bucket than a row pointing at nothing.
    await uploadObject(req as unknown as Request, stratusKey, req.file.buffer, req.file.mimetype);

    const row = await insertRow(ATTACHMENT_TABLE, {
      contextType: contextTypeRaw,
      contextId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      stratusKey,
      uploaderId: req.user?.id ?? null,
    });

    sendSuccess(res, shapeAttachment(row), 'File uploaded', 201);
  } catch (error) {
    sendServerError(res, 'Failed to upload file', error);
  }
}

/** GET /api/uploads/:id -- redirect to a fresh pre-signed Stratus URL. */
export async function downloadFile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(ATTACHMENT_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Attachment not found');
      return;
    }

    const stratusKey = String(row.stratusKey ?? '');
    if (!stratusKey) {
      sendError(res, 'Attachment record is missing its Stratus key', 500);
      return;
    }

    const signedUrl = await getSignedDownloadUrl(req as unknown as Request, stratusKey, 300);
    res.redirect(302, signedUrl);
  } catch (error) {
    sendServerError(res, 'Failed to generate download URL', error);
  }
}

/** DELETE /api/uploads/:id -- uploader or admin only. */
export async function deleteFile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(ATTACHMENT_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Attachment not found');
      return;
    }

    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const isUploader = req.user?.id && String(row.uploaderId) === req.user.id;
    if (!isAdmin && !isUploader) {
      sendForbidden(res, 'You can only delete your own uploads');
      return;
    }

    const stratusKey = String(row.stratusKey ?? '');
    if (stratusKey) {
      // Best-effort -- if Stratus delete fails we still drop the row, so
      // the user-visible record is gone. Orphaned objects can be garbage-
      // collected later.
      try {
        await deleteObject(req as unknown as Request, stratusKey);
      } catch (err) {
        console.error('Stratus delete failed; proceeding to drop row:', err);
      }
    }
    await deleteRow(ATTACHMENT_TABLE, id);

    sendSuccess(res, { id }, 'Attachment deleted');
  } catch (error) {
    sendServerError(res, 'Failed to delete attachment', error);
  }
}
