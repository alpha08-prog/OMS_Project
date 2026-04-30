/**
 * Zoho Stratus wrapper.
 *
 * Stratus is Catalyst's S3-compatible object store. Used here to hold user-
 * uploaded attachments (grievance evidence, news images, photo-booth photos,
 * tour attachments). Files never live in the Data Store -- only metadata
 * (filename, size, MIME, stratus key) does, joined back via the Attachment
 * table's ROWID.
 *
 * Bucket name comes from env. Default `oms-attachments`. The bucket should be
 * created in Catalyst Console with permission template = "Authenticated"
 * (so only SDK-authenticated callers -- i.e. this backend -- can write/read
 * directly). End users get pre-signed URLs with short TTLs.
 */
import type { Request } from 'express';
import { getCatalystApp } from './catalyst';

const DEFAULT_BUCKET = 'oms-attachments';

function bucketName(): string {
  const v = process.env.OMS_STRATUS_BUCKET ?? process.env.STRATUS_BUCKET;
  return (v && v.trim()) || DEFAULT_BUCKET;
}

function getBucket(req: Request) {
  const app = getCatalystApp(req);
  return app.stratus().bucket(bucketName());
}

/**
 * Upload a buffer to Stratus via the SDK's putObject.
 *
 * For admin scope (our backend), the SDK internally:
 *   1. POSTs /bucket/signature to fetch an stsSignature set of qs params
 *      (requires ZohoCatalyst.buckets.objects.CREATE on the refresh token).
 *   2. PUTs to <bucket_url>/_signed/<key>?<signature qs> — no Authorization
 *      header on the actual PUT, the signature in the URL authenticates it.
 *
 * Earlier failures of this call were caused by step 1 returning a Tomcat
 * HTML 400 because the refresh token lacked the buckets.objects.CREATE
 * scope. With the scope now attached, step 1 succeeds and the signed PUT
 * goes through.
 */
export async function uploadObject(
  req: Request,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const bucket = getBucket(req);
  await (bucket.putObject as any)(key, body, { contentType });
}

/**
 * Delete an object from Stratus. Idempotent -- swallows 404.
 */
export async function deleteObject(req: Request, key: string): Promise<void> {
  try {
    const bucket = getBucket(req);
    await bucket.deleteObject(key);
  } catch (err: any) {
    // Ignore "not found" -- treat delete as idempotent.
    const msg = String(err?.message ?? '');
    if (err?.statusCode === 404 || /not[\s_-]?found/i.test(msg)) return;
    throw err;
  }
}

/**
 * Generate a short-lived pre-signed download URL for a private object.
 * Default TTL: 5 minutes. Browser fetches directly from Stratus -- no
 * proxy traffic through the backend. Long enough for the user to click
 * through, short enough that leaked URLs expire fast.
 */
export async function getSignedDownloadUrl(
  req: Request,
  key: string,
  expirySeconds = 300
): Promise<string> {
  const bucket = getBucket(req);
  const res = await (bucket.generatePreSignedUrl as any)(key, 'GET', {
    expiryIn: String(expirySeconds),
  });
  // SDK returns { signature, expires_in_seconds, active_from } -- `signature`
  // holds the actual URL despite the name. Fall back to common alternates
  // in case of SDK version skew.
  const url =
    res?.signature ||
    res?.signed_url ||
    res?.url ||
    res?.preSignedUrl ||
    null;
  if (!url) {
    throw new Error(
      `Stratus generatePreSignedUrl returned unexpected shape: ${JSON.stringify(res)}`
    );
  }
  return String(url);
}

/**
 * Build a stable object key for an attachment.
 *
 *   <contextType>/<contextId or 'orphan'>/<timestamp>-<random>-<safeFilename>
 *
 * Including context in the path makes it easy to navigate the bucket in the
 * Stratus console and (later) to scope per-prefix retention policies.
 */
export function buildObjectKey(
  contextType: string,
  contextId: string | null | undefined,
  originalFilename: string
): string {
  const safe = originalFilename
    .replace(/[^\w.\-]+/g, '_') // strip anything that's not alnum, dot, dash, underscore
    .slice(0, 80);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const ctx = (contextId ?? 'orphan').toString();
  return `${contextType.toLowerCase()}/${ctx}/${ts}-${rand}-${safe}`;
}
