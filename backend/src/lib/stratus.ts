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
 *
 * Implementation note — IN DC quirk:
 *   The first request from a fresh fetch connection to api.catalyst.zoho.in
 *   /baas/v1/.../bucket/* returns a Tomcat HTML 400 (cold-start bug on the
 *   IN datacenter). Once any request succeeds the connection is warm and
 *   every subsequent call works. We therefore do a warmup GET before the
 *   first real call and remember success in-process.
 */
import type { Request } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DEFAULT_BUCKET = 'oms-attachments';

function bucketName(): string {
  const v = process.env.OMS_STRATUS_BUCKET ?? process.env.STRATUS_BUCKET;
  return (v && v.trim()) || DEFAULT_BUCKET;
}

const API_DOMAIN = ((): string => {
  const raw = (process.env.CATALYST_API_DOMAIN || 'api.catalyst.zoho.in').replace(/\/$/, '');
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
})();
const ACCOUNTS_DOMAIN = (process.env.X_ZOHO_CATALYST_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '');
const STRATUS_SUFFIX = process.env.X_ZOHO_STRATUS_RESOURCE_SUFFIX || '.zohostratus.com';

function bucketBaseUrl(): string {
  const env = process.env.CATALYST_ENVIRONMENT || 'Development';
  const suffix = env === 'Development' ? '-development' : '';
  return `https://${bucketName()}${suffix}${STRATUS_SUFFIX}`;
}

// ─── access token ──────────────────────────────────────────────────────────
// Cached in-process and persisted to /tmp so dev-time test runs don't trip
// Zoho's "too many continuous OAuth refresh" rate limit.

const TOKEN_CACHE_FILE = path.join(os.tmpdir(), 'oms-zoho-access-token.json');
let cachedAccessToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.value;
  }
  try {
    const raw = fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed?.expiresAt > now + 60_000) {
      cachedAccessToken = parsed;
      return parsed.value;
    }
  } catch {}

  const params = new URLSearchParams({
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`${ACCOUNTS_DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json: any = await res.json();
  if (!json?.access_token) {
    throw new Error(`OAuth token refresh failed: ${JSON.stringify(json)}`);
  }
  cachedAccessToken = {
    value: json.access_token,
    expiresAt: now + Number(json.expires_in ?? 3600) * 1000,
  };
  try { fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cachedAccessToken)); } catch {}
  return cachedAccessToken.value;
}

// ─── connection warmup ─────────────────────────────────────────────────────
// IN DC: the first fetch to api.catalyst.zoho.in/baas/v1/.../bucket/* returns
// Tomcat HTML 400 unless we've already made some other call to that host. A
// benign GET /bucket/objects warms it up and unblocks every subsequent call.

let warmupDone = false;

async function warmupOnce(): Promise<void> {
  if (warmupDone) return;
  const token = await getAccessToken();
  const url = `${API_DOMAIN}/baas/v1/project/${process.env.CATALYST_PROJECT_ID}/bucket/objects?bucket_name=${bucketName()}&folder_listing=false`;
  // bare Authorization is the most reliable shape — proven via raw probe
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  // We don't care about the body; we only need this connection to have done
  // one round-trip. Even a non-2xx still warms the TLS / HTTP/2 state.
  await res.text().catch(() => undefined);
  warmupDone = true;
}

/**
 * Optional: call from app.ts startup so the very first user upload doesn't
 * pay the warmup latency. Safe to omit — uploadObject() will warm itself up
 * on first use.
 */
export async function warmupStratus(): Promise<void> {
  try {
    await warmupOnce();
  } catch (err) {
    // best-effort; warmupOnce will run again on first uploadObject if it failed
    warmupDone = false;
    // eslint-disable-next-line no-console
    console.warn('[stratus] warmup failed (will retry on first upload):', (err as Error)?.message);
  }
}

// ─── /bucket/signature  →  per-bucket sts query params ─────────────────────

async function fetchBucketSignatureQs(): Promise<string> {
  await warmupOnce();
  const token = await getAccessToken();
  const env = process.env.CATALYST_ENVIRONMENT || 'Development';
  const url = `${API_DOMAIN}/baas/v1/project/${process.env.CATALYST_PROJECT_ID}/bucket/signature?bucket_name=${bucketName()}`;

  // Without the X-Catalyst-Environment / Environment headers, Catalyst issues
  // a signature scoped to the bare bucket name (production), not the env-
  // suffixed bucket (oms-attachments-development), and the PUT then fails
  // with "Qualified Resources doesn't meet the required resource for the action".
  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    PROJECT_ID: process.env.CATALYST_PROJECT_ID!,
    'X-Catalyst-Environment': env,
    Environment: env,
    'X-CATALYST-USER': 'admin',
    Accept: 'application/vnd.catalyst.v2+json',
    'User-Agent': 'zcatalyst-node/3.4.0',
  };

  const res = await fetch(url, { method: 'POST', headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`bucket/signature ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  const qs = json?.data?.signature;
  if (typeof qs !== 'string') {
    throw new Error(`bucket/signature: unexpected shape ${text.slice(0, 300)}`);
  }
  return qs;
}

// ─── public API ────────────────────────────────────────────────────────────

/**
 * Upload a buffer to Stratus.
 * Throws on failure. Returns void; callers persist the key/metadata themselves.
 */
export async function uploadObject(
  _req: Request,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const qs = await fetchBucketSignatureQs();
  const putUrl = `${bucketBaseUrl()}/_signed/${encodeURI(key)}?${qs}`;
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
    body: body as any,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '<unreadable>');
    throw new Error(`Stratus PUT failed: ${res.status} ${res.statusText} — ${errBody.slice(0, 300)}`);
  }
}

/**
 * Delete an object from Stratus. Idempotent — swallows 404.
 */
export async function deleteObject(_req: Request, key: string): Promise<void> {
  await warmupOnce();
  const token = await getAccessToken();
  const env = process.env.CATALYST_ENVIRONMENT || 'Development';
  const url =
    `${API_DOMAIN}/baas/v1/project/${process.env.CATALYST_PROJECT_ID}` +
    `/bucket/object?bucket_name=${bucketName()}&object_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      PROJECT_ID: process.env.CATALYST_PROJECT_ID!,
      'X-Catalyst-Environment': env,
      Environment: env,
      'X-CATALYST-USER': 'admin',
      Accept: 'application/vnd.catalyst.v2+json',
    },
  });
  if (res.status === 404) return;
  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable>');
    if (/not[\s_-]?found/i.test(text)) return;
    throw new Error(`Stratus DELETE failed: ${res.status} ${res.statusText} — ${text.slice(0, 300)}`);
  }
}

/**
 * Generate a short-lived pre-signed download URL for a private object.
 * Default TTL: 5 minutes. Browser fetches directly from Stratus -- no proxy
 * traffic through the backend. Long enough for the user to click through,
 * short enough that leaked URLs expire fast.
 */
export async function getSignedDownloadUrl(
  _req: Request,
  key: string,
  _expirySeconds = 300
): Promise<string> {
  // Use the bucket-level signature from POST /bucket/signature instead of
  // the per-object /bucket/object/signed-url endpoint. The bucket-level
  // policy authorises BOTH GetObject and PutObject within the bucket for
  // ~1 hour, so the same query-string can sign downloads as well as
  // uploads. This avoids /bucket/object/signed-url, which on the IN DC
  // returns a Tomcat HTML 400 when called with full SDK admin headers.
  const qs = await fetchBucketSignatureQs();
  return `${bucketBaseUrl()}/_signed/${encodeURI(key)}?${qs}`;
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
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const ctx = (contextId ?? 'orphan').toString();
  return `${contextType.toLowerCase()}/${ctx}/${ts}-${rand}-${safe}`;
}
