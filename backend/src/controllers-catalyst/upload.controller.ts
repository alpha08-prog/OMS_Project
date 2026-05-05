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
import {
  getRow,
  insertRow,
  deleteRow,
  executeZCQL,
  zcqlEscapeValue,
  CatalystRow,
} from '../lib/catalyst-client';
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

  // Step 1: Stratus put. If this fails, surface a Stratus-specific message
  // so the operator can tell whether it's bucket auth, network, or quota.
  try {
    await uploadObject(req as unknown as Request, stratusKey, req.file.buffer, req.file.mimetype);
  } catch (err: any) {
    // Pull as many fields off the SDK error as exist — different versions of
    // zcatalyst-sdk-node attach the response differently (statusCode, status,
    // response.statusCode, etc.). Logging the lot makes diagnosis much faster
    // when the only thing that comes through to the client is an HTML body.
    console.error('[upload] Stratus put failed:', {
      bucket: process.env.OMS_STRATUS_BUCKET ?? 'oms-attachments',
      key: stratusKey,
      mime: req.file.mimetype,
      size: req.file.size,
      message: err?.message,
      name: err?.name,
      code: err?.code,
      statusCode: err?.statusCode ?? err?.status ?? err?.response?.statusCode,
      responseHeaders: err?.response?.headers,
      responseBody:
        typeof err?.response?.body === 'string'
          ? err.response.body.slice(0, 500)
          : err?.response?.body,
      stack: err?.stack,
    });
    const detail = err?.message ? String(err.message).slice(0, 300) : 'unknown error';
    sendError(res, `Stratus upload failed: ${detail}`, 502);
    return;
  }

  // Step 2: write the Attachment row. If this fails after the object is
  // already in Stratus, the bucket has an orphan we'll log and clean up
  // separately — but we still tell the client what happened.
  let row;
  try {
    row = await insertRow(ATTACHMENT_TABLE, {
      contextType: contextTypeRaw,
      contextId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      stratusKey,
      uploaderId: req.user?.id ?? null,
    });
  } catch (err: any) {
    console.error('[upload] Attachment insert failed (Stratus object already written):', {
      stratusKey,
      message: err?.message,
      stack: err?.stack,
      raw: err,
    });
    const detail = err?.message ? String(err.message).slice(0, 300) : 'unknown error';
    sendError(res, `Attachment record save failed: ${detail}`, 500);
    return;
  }

  sendSuccess(res, shapeAttachment(row), 'File uploaded', 201);
}

/**
 * GET /api/uploads?contextType=GRIEVANCE&contextId=123
 *
 * Lists attachments for a single parent record. Authenticated users only;
 * parent-record ACL is enforced upstream (if you can read the grievance,
 * you can read its attachments). Admins automatically see everything because
 * the parent routes return everything for them.
 */
export async function listAttachments(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const contextTypeRaw = String(req.query?.contextType ?? '').toUpperCase().trim();
    if (!ALLOWED_CONTEXTS.has(contextTypeRaw)) {
      sendError(
        res,
        `Invalid contextType. Must be one of: ${Array.from(ALLOWED_CONTEXTS).join(', ')}`,
        400
      );
      return;
    }

    const contextIdRaw = req.query?.contextId;
    const contextId = contextIdRaw ? String(contextIdRaw).trim() : '';
    if (!contextId) {
      sendError(res, 'contextId is required', 400);
      return;
    }

    const query =
      `SELECT * FROM ${ATTACHMENT_TABLE} ` +
      `WHERE contextType = '${zcqlEscapeValue(contextTypeRaw)}' ` +
      `AND contextId = '${zcqlEscapeValue(contextId)}' ` +
      `ORDER BY CREATEDTIME DESC`;
    const rows = await executeZCQL<CatalystRow>(query);

    const attachments = rows.map(shapeAttachment);
    sendSuccess(res, attachments, 'Attachments retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to list attachments', error);
  }
}

/**
 * GET /api/uploads/:id
 *
 * Streams the attachment bytes to the client through this backend, instead
 * of redirecting to a Stratus signed URL.
 *
 * Why proxy instead of redirect: Stratus signed URLs don't return
 * Access-Control-Allow-Origin, so any XHR/fetch from the browser that
 * follows the redirect is blocked by CORS. Workarounds via window.open
 * are fragile (popup blockers, browser extensions hijacking about:blank,
 * Stratus's Content-Disposition decisions). Streaming through the same
 * origin makes axios `responseType: 'blob'` work cleanly on the frontend.
 */
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

    const filename = String(row.filename ?? 'attachment');
    const mimeType = String(row.mimeType ?? 'application/octet-stream');

    const signedUrl = await getSignedDownloadUrl(req as unknown as Request, stratusKey, 300);

    const upstream = await fetch(signedUrl);
    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      console.error('[uploads] Stratus GET failed', {
        status: upstream.status,
        statusText: upstream.statusText,
        body: errBody.slice(0, 300),
      });
      sendError(
        res,
        `Stratus returned ${upstream.status} ${upstream.statusText}`,
        502
      );
      return;
    }

    // Buffer the whole response. Files are capped at 10 MB by the upload
    // path so memory pressure is bounded; buffering avoids streaming bugs
    // (Readable.fromWeb dropping bytes, partial writes on socket close).
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length === 0) {
      console.error('[uploads] Stratus returned 200 but body was empty', { stratusKey });
      sendError(res, 'Stratus returned an empty body for this attachment', 502);
      return;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buf.length));
    // RFC 5987 — encode the filename so non-ASCII names round-trip safely.
    const safeFilename = filename.replace(/[\\/?"*<>|]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
    );
    res.send(buf);
  } catch (error) {
    sendServerError(res, 'Failed to download attachment', error);
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
