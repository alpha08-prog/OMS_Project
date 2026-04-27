/**
 * Thin Catalyst Data Store REST client.
 *
 * The official zcatalyst-sdk-node v3.4.0 has bugs that break local-dev mode
 * (empty next_token=, malformed Accept header, etc). This client bypasses the
 * SDK and calls the documented REST API directly. Works identically locally
 * and inside AppSail.
 *
 * Authentication uses an OAuth refresh token (stored in env vars). The access
 * token is cached in-process and re-fetched ~1 minute before expiry.
 */
import https from 'https';

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: AccessTokenCache | null = null;

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v && v.trim()) return v.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${key}`);
}

function accountsHost(): string {
  const url = env('X_ZOHO_CATALYST_ACCOUNTS_URL', 'https://accounts.zoho.in');
  return new URL(url).host;
}

function apiHost(): string {
  const url = env('X_ZOHO_CATALYST_CONSOLE_URL', 'https://api.catalyst.zoho.in');
  return new URL(url).host;
}

function projectId(): string {
  return env('CATALYST_PROJECT_ID');
}

/** Fetch a fresh access token via the refresh-token grant. */
function fetchAccessToken(): Promise<AccessTokenCache> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env('CATALYST_CLIENT_ID'),
      client_secret: env('CATALYST_CLIENT_SECRET'),
      refresh_token: env('CATALYST_REFRESH_TOKEN'),
    }).toString();

    const req = https.request(
      {
        hostname: accountsHost(),
        path: '/oauth/v2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c.toString()));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (!json.access_token) {
              reject(new Error(`OAuth refresh failed: ${raw}`));
              return;
            }
            resolve({
              token: json.access_token,
              expiresAt: Date.now() + (json.expires_in - 60) * 1000,
            });
          } catch (e) {
            reject(new Error(`OAuth response parse error: ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

/** Get a valid access token, using cache when possible. */
async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  tokenCache = await fetchAccessToken();
  return tokenCache.token;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: any;
  query?: Record<string, string | number | undefined>;
}

async function apiCall<T = any>(opts: RequestOptions): Promise<T> {
  const token = await getAccessToken();

  let path = `/baas/v1/project/${projectId()}${opts.path}`;
  if (opts.query) {
    const qs = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) path += `?${qs}`;
  }

  const bodyString =
    opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'X-Catalyst-Environment': env('CATALYST_ENVIRONMENT', 'Development'),
  };
  if (bodyString) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(bodyString));
  }

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      { hostname: apiHost(), path, method: opts.method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c.toString()));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              Object.assign(new Error(`Catalyst ${res.statusCode}: ${raw.substring(0, 300)}`), {
                statusCode: res.statusCode,
                body: raw,
              })
            );
            return;
          }
          try {
            resolve(parseSafe(raw) as T);
          } catch {
            resolve(raw as any);
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyString) req.write(bodyString);
    req.end();
  });
}

/**
 * Catalyst returns ROWID / CREATORID as JSON numbers (e.g., 37719000000049102)
 * which exceed Number.MAX_SAFE_INTEGER (9007199254740991). JSON.parse silently
 * truncates them to the nearest representable double — mangling the ID.
 *
 * We preprocess the raw response: quote any unquoted ID-like field so it stays
 * a string after parse. List responses already return them as strings; this
 * normalises insert/update/get responses to match.
 */
function parseSafe(raw: string): unknown {
  const idFields = ['ROWID', 'CREATORID'];
  let safe = raw;
  for (const field of idFields) {
    const re = new RegExp(`("${field}"\\s*:\\s*)(\\d+)`, 'g');
    safe = safe.replace(re, '$1"$2"');
  }
  return JSON.parse(safe);
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CatalystRow {
  ROWID: string;
  CREATORID?: string;
  CREATEDTIME?: string;
  MODIFIEDTIME?: string;
  [column: string]: any;
}

interface ListResponse {
  status: string;
  data: CatalystRow[];
  more_records?: boolean;
  next_token?: string;
}

interface InsertResponse {
  status: string;
  data: CatalystRow[];
}

interface SingleResponse {
  status: string;
  data: CatalystRow;
}

/** Format a Date / ISO string as Catalyst requires: `YYYY-MM-DD HH:mm:ss`. */
export function toCatalystDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Catalyst's max page size for the row endpoint is 300.
const MAX_PAGE_SIZE = 300;

/**
 * List rows from a table.
 *  - tableName: Catalyst table name (e.g. 'Visitor')
 *  - maxRows:   page size (Catalyst max 300 per request)
 *  - nextToken: for cursor-based pagination
 */
export async function listRows(
  tableName: string,
  options: { maxRows?: number; nextToken?: string } = {}
): Promise<{ rows: CatalystRow[]; moreRecords: boolean; nextToken?: string }> {
  const result = await apiCall<ListResponse>({
    method: 'GET',
    path: `/table/${tableName}/row`,
    query: {
      max_rows: Math.min(options.maxRows ?? 200, MAX_PAGE_SIZE),
      ...(options.nextToken ? { next_token: options.nextToken } : {}),
    },
  });
  return {
    rows: result.data ?? [],
    moreRecords: Boolean(result.more_records),
    nextToken: result.next_token,
  };
}

/** Fetch ALL rows in a table (auto-paginates). Use sparingly — pulls full table. */
export async function listAllRows(
  tableName: string,
  pageSize = MAX_PAGE_SIZE
): Promise<CatalystRow[]> {
  const all: CatalystRow[] = [];
  let nextToken: string | undefined;
  do {
    const page = await listRows(tableName, {
      maxRows: Math.min(pageSize, MAX_PAGE_SIZE),
      nextToken,
    });
    all.push(...page.rows);
    nextToken = page.moreRecords ? page.nextToken : undefined;
  } while (nextToken);
  return all;
}

/** Get a single row by ROWID. Returns null if not found. */
export async function getRow(
  tableName: string,
  rowId: string | number
): Promise<CatalystRow | null> {
  try {
    const result = await apiCall<SingleResponse>({
      method: 'GET',
      path: `/table/${tableName}/row/${rowId}`,
    });
    return result.data ?? null;
  } catch (err: any) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

/** Insert a single row. Returns the row including server-assigned ROWID. */
export async function insertRow(
  tableName: string,
  row: Record<string, any>
): Promise<CatalystRow> {
  const result = await apiCall<InsertResponse>({
    method: 'POST',
    path: `/table/${tableName}/row`,
    body: [row],
  });
  return result.data[0];
}

/** Update a row. Pass ROWID + the columns to change. */
export async function updateRow(
  tableName: string,
  row: { ROWID: string | number; [column: string]: any }
): Promise<CatalystRow> {
  const result = await apiCall<InsertResponse>({
    method: 'PATCH',
    path: `/table/${tableName}/row`,
    body: [row],
  });
  // Catalyst's PATCH response shape varies — sometimes data is the updated row,
  // sometimes empty. Fall back to a fresh GET so callers always get the row.
  const updated = result.data?.[0];
  if (updated && updated.ROWID) return updated;
  const fresh = await getRow(tableName, row.ROWID);
  if (!fresh) throw new Error(`Row ${row.ROWID} not found after update`);
  return fresh;
}

/** Delete a row by ROWID. */
export async function deleteRow(
  tableName: string,
  rowId: string | number
): Promise<void> {
  await apiCall({
    method: 'DELETE',
    path: `/table/${tableName}/row/${rowId}`,
  });
}
