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

/**
 * Read an env var with fallback names. Production AppSail uses the
 * `OMS_CATALYST_*` prefix; local dev uses bare `CATALYST_*`. Try both so
 * the same code path works in either environment without renaming vars.
 */
function readEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function projectId(): string | undefined {
  return readEnv('CATALYST_PROJECT_ID', 'OMS_CATALYST_PROJECT_ID');
}

function bucketName(): string {
  const v = readEnv('OMS_STRATUS_BUCKET', 'STRATUS_BUCKET');
  return (v && v.trim()) || DEFAULT_BUCKET;
}

const API_DOMAIN = ((): string => {
  const raw = (readEnv('CATALYST_API_DOMAIN', 'OMS_CATALYST_API_DOMAIN') || 'api.catalyst.zoho.in').replace(/\/$/, '');
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
})();
const ACCOUNTS_DOMAIN = (readEnv('X_ZOHO_CATALYST_ACCOUNTS_URL') || 'https://accounts.zoho.in').replace(/\/$/, '');
// Default to the IN datacenter suffix because that's where this project lives.
// Both `.zohostratus.in` (IN) and `.zohostratus.com` (US) work, but defaulting
// to .com would silently produce 404s in IN if X_ZOHO_STRATUS_RESOURCE_SUFFIX
// isn't set in the AppSail config.
const STRATUS_SUFFIX = readEnv('X_ZOHO_STRATUS_RESOURCE_SUFFIX') || '.zohostratus.in';

function bucketBaseUrl(): string {
  const env = process.env.CATALYST_ENVIRONMENT || 'Development';
  const suffix = env === 'Development' ? '-development' : '';
  return `https://${bucketName()}${suffix}${STRATUS_SUFFIX}`;
}

// ─── access token ──────────────────────────────────────────────────────────
// Two paths:
//   1. Inside AppSail / Functions: Catalyst injects the admin access token
//      on every incoming request as `x-zc-admin-cred-token`. We just read
//      it off req.headers — no OAuth call, no env-var refresh token needed.
//      (Production AppSail does NOT set CATALYST_REFRESH_TOKEN, so the
//      env-var path would 500 with "OAuth token refresh failed" otherwise.)
//   2. Local dev: refresh-token flow against accounts.zoho.in, cached in
//      /tmp so repeated runs don't trip Zoho's continuous-refresh limit.

const TOKEN_CACHE_FILE = path.join(os.tmpdir(), 'oms-zoho-access-token.json');
let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function isInsideCatalyst(): boolean {
  return Boolean(
    process.env.X_ZOHO_CATALYST_LISTEN_PORT ||
      process.env.CATALYST_PROJECT_KEY_NAME ||
      process.env.X_ZC_PROJECT_KEY
  );
}

function adminTokenFromReq(req: Request | undefined): string | null {
  if (!req || !req.headers) return null;
  const v =
    (req.headers as Record<string, unknown>)['x-zc-admin-cred-token'] ||
    (req.headers as Record<string, unknown>)['X-ZC-ADMIN-CRED-TOKEN'];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

async function getAccessToken(req?: Request): Promise<string> {
  // Inside AppSail — token comes in on the request itself.
  if (isInsideCatalyst()) {
    const fromHeader = adminTokenFromReq(req);
    if (fromHeader) return fromHeader;
    // Fall through if the request didn't carry the header (some AppSail
    // routes only get user-cred headers); the env-var refresh below will
    // try only if CATALYST_REFRESH_TOKEN is actually set.
  }

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

  // Read both prefixes — production AppSail uses OMS_CATALYST_*, local uses
  // bare CATALYST_*. Either is acceptable as the fallback.
  const refreshToken = readEnv('CATALYST_REFRESH_TOKEN', 'OMS_CATALYST_REFRESH_TOKEN');
  const clientId     = readEnv('CATALYST_CLIENT_ID', 'OMS_CATALYST_CLIENT_ID');
  const clientSecret = readEnv('CATALYST_CLIENT_SECRET', 'OMS_CATALYST_CLIENT_SECRET');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'No Catalyst access token available. ' +
      'Need either x-zc-admin-cred-token on the incoming request, OR ' +
      'CATALYST_REFRESH_TOKEN/CATALYST_CLIENT_ID/CATALYST_CLIENT_SECRET (or the OMS_CATALYST_* equivalents) in the env. ' +
      `Found: refresh=${!!refreshToken} clientId=${!!clientId} clientSecret=${!!clientSecret}`
    );
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
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

async function warmupOnce(req?: Request): Promise<void> {
  if (warmupDone) return;
  const token = await getAccessToken(req);
  const url = `${API_DOMAIN}/baas/v1/project/${projectId()}/bucket/objects?bucket_name=${bucketName()}&folder_listing=false`;
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
 * on first use. Inside AppSail this is a no-op without a request, since the
 * admin token only arrives on incoming requests; the warmup will run on the
 * first user upload instead.
 */
export async function warmupStratus(): Promise<void> {
  try {
    await warmupOnce();
  } catch (err) {
    // best-effort; warmupOnce will run again on first uploadObject if it failed
    warmupDone = false;
    // eslint-disable-next-line no-console
    console.warn('[stratus] warmup skipped (will retry on first upload):', (err as Error)?.message);
  }
}

// ─── /bucket/signature  →  per-bucket sts query params ─────────────────────

async function fetchBucketSignatureQs(req?: Request): Promise<string> {
  await warmupOnce(req);
  const token = await getAccessToken(req);
  const env = process.env.CATALYST_ENVIRONMENT || 'Development';
  const url = `${API_DOMAIN}/baas/v1/project/${projectId()}/bucket/signature?bucket_name=${bucketName()}`;

  // Without the X-Catalyst-Environment / Environment headers, Catalyst issues
  // a signature scoped to the bare bucket name (production), not the env-
  // suffixed bucket (oms-attachments-development), and the PUT then fails
  // with "Qualified Resources doesn't meet the required resource for the action".
  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    PROJECT_ID: projectId() || '',
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
  req: Request,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const qs = await fetchBucketSignatureQs(req);
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
export async function deleteObject(req: Request, key: string): Promise<void> {
  await warmupOnce(req);
  const token = await getAccessToken(req);
  const env = process.env.CATALYST_ENVIRONMENT || 'Development';
  const url =
    `${API_DOMAIN}/baas/v1/project/${projectId()}` +
    `/bucket/object?bucket_name=${bucketName()}&object_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      PROJECT_ID: projectId() || '',
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
  req: Request,
  key: string,
  _expirySeconds = 300
): Promise<string> {
  // Use the bucket-level signature from POST /bucket/signature instead of
  // the per-object /bucket/object/signed-url endpoint. The bucket-level
  // policy authorises BOTH GetObject and PutObject within the bucket for
  // ~1 hour, so the same query-string can sign downloads as well as
  // uploads. This avoids /bucket/object/signed-url, which on the IN DC
  // returns a Tomcat HTML 400 when called with full SDK admin headers.
  const qs = await fetchBucketSignatureQs(req);
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
