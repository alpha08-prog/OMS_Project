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
import { recordCatalystCall } from './request-metrics';

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: AccessTokenCache | null = null;

// Shared keep-alive agent so outbound calls to accounts.zoho.in /
// api.catalyst.zoho.in reuse TCP+TLS connections instead of paying a fresh
// handshake (~100-200 ms) per request. Big win because list endpoints fan out
// into multiple sequential calls per user request.
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  // Raised for concurrency: ~25 simultaneous users, and each request now fans
  // out into several PARALLEL Catalyst calls (was serial). 50 sockets would
  // queue under that burst; 128 lets the parallel fan-out run without blocking.
  maxSockets: 128,
  maxFreeSockets: 20,
});

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v && v.trim()) return v.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${key}`);
}

// Catalyst AppSail reserves env-var names starting with CATALYST_ and X_ZOHO_,
// so user-set OAuth credentials must use a non-reserved prefix in prod.
// Reads OMS_-prefixed names first, falls back to legacy CATALYST_/X_ZOHO_ names
// (so local .env keeps working unchanged).
function envEither(newKey: string, oldKey: string, fallback?: string): string {
  const v = process.env[newKey] ?? process.env[oldKey];
  if (v && v.trim()) return v.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${newKey} (or legacy ${oldKey})`);
}

function accountsHost(): string {
  const url = envEither(
    'OMS_ZOHO_ACCOUNTS_URL',
    'X_ZOHO_CATALYST_ACCOUNTS_URL',
    'https://accounts.zoho.in'
  );
  return new URL(url).host;
}

function apiHost(): string {
  const url = envEither(
    'OMS_ZOHO_CONSOLE_URL',
    'X_ZOHO_CATALYST_CONSOLE_URL',
    'https://api.catalyst.zoho.in'
  );
  return new URL(url).host;
}

function projectId(): string {
  return envEither('OMS_CATALYST_PROJECT_ID', 'CATALYST_PROJECT_ID');
}

/** Fetch a fresh access token via the refresh-token grant. */
function fetchAccessToken(): Promise<AccessTokenCache> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: envEither('OMS_CATALYST_CLIENT_ID', 'CATALYST_CLIENT_ID'),
      client_secret: envEither('OMS_CATALYST_CLIENT_SECRET', 'CATALYST_CLIENT_SECRET'),
      refresh_token: envEither('OMS_CATALYST_REFRESH_TOKEN', 'CATALYST_REFRESH_TOKEN'),
    }).toString();

    const req = https.request(
      {
        hostname: accountsHost(),
        path: '/oauth/v2/token',
        method: 'POST',
        agent: keepAliveAgent,
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

/**
 * Diagnostic snapshot of how this process is configured to reach Catalyst.
 * Secrets-safe (never returns the client secret / refresh token). Logged once
 * at boot so prod logs reveal the repo-unknowable facts: which Catalyst
 * environment the request header targets, and whether it was set explicitly or
 * silently defaulted to 'Development'.
 */
export function catalystRuntimeInfo(): {
  environment: string;
  environmentExplicit: boolean;
  apiHost: string;
  accountsHost: string;
  projectId: string;
  oauthConfigured: boolean;
} {
  const safe = (fn: () => string): string => {
    try {
      return fn();
    } catch {
      return '<unset>';
    }
  };
  let oauthConfigured = true;
  try {
    envEither('OMS_CATALYST_CLIENT_ID', 'CATALYST_CLIENT_ID');
    envEither('OMS_CATALYST_CLIENT_SECRET', 'CATALYST_CLIENT_SECRET');
    envEither('OMS_CATALYST_REFRESH_TOKEN', 'CATALYST_REFRESH_TOKEN');
  } catch {
    oauthConfigured = false;
  }
  return {
    environment: safe(() =>
      envEither('OMS_CATALYST_ENVIRONMENT', 'CATALYST_ENVIRONMENT', 'Development')
    ),
    environmentExplicit: Boolean(
      process.env.OMS_CATALYST_ENVIRONMENT?.trim() || process.env.CATALYST_ENVIRONMENT?.trim()
    ),
    apiHost: safe(apiHost),
    accountsHost: safe(accountsHost),
    projectId: safe(projectId),
    oauthConfigured,
  };
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: any;
  query?: Record<string, string | number | undefined>;
}

async function apiCall<T = any>(opts: RequestOptions): Promise<T> {
  // Diagnostic: did this call have to mint a fresh OAuth token (cold token cache)?
  const tokenWasCached = !!(tokenCache && tokenCache.expiresAt > Date.now());
  const token = await getAccessToken();
  const tokenFetched = !tokenWasCached;

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
    'X-Catalyst-Environment': envEither(
      'OMS_CATALYST_ENVIRONMENT',
      'CATALYST_ENVIRONMENT',
      'Development'
    ),
  };
  if (bodyString) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(bodyString));
  }

  // Diagnostic timing: record this round-trip's wall time against the current
  // request so the per-request perf log can sum Catalyst calls. The OAuth grant
  // (if any) happened above and is reflected by `tokenFetched`, not in `ms`.
  const startNs = process.hrtime.bigint();
  const recordTiming = (): void => {
    const ms = Number(process.hrtime.bigint() - startNs) / 1e6;
    recordCatalystCall({ method: opts.method, path: opts.path, ms, tokenFetched });
  };

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        hostname: apiHost(),
        path,
        method: opts.method,
        agent: keepAliveAgent,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c.toString()));
        res.on('end', () => {
          recordTiming();
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
    req.on('error', (err) => {
      recordTiming();
      reject(err);
    });
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

/**
 * Current wall-clock time in IST, formatted as Catalyst datetime
 * (`YYYY-MM-DD HH:mm:ss`, no timezone marker).
 *
 * Catalyst datetime columns are timezone-naive: whatever string you write is
 * the string it reads back. AppSail containers typically run UTC, so doing
 * `toCatalystDate(new Date())` writes UTC wall-clock — which the browser then
 * parses as local time, displaying ~5.5h off for Indian users.
 *
 * Use this whenever you need to stamp "now" on a record (`verifiedAt`,
 * `resolvedAt`, `markedAt`, `approvedAt`, `completedAt`, etc). For
 * user-supplied dates, keep using `toCatalystDate(value)` so the input is
 * preserved as-given.
 */
export function nowCatalystIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`
  );
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

/**
 * Execute a ZCQL query against the Data Store and return rows.
 *
 * ZCQL pushes filter / sort / limit down to the database, so callers don't
 * need to fetch a full table and filter in JS. There is no parameter binding
 * — values must be escaped with `zcqlEscapeValue` to prevent injection.
 *
 * Response shape: `{ status, data: [{ <TableName>: { col1, col2, ... } }, ...] }`
 * — Catalyst nests each row under the table name. We flatten it for callers
 * unless `flatten: false` is passed.
 */
export async function executeZCQL<T = CatalystRow>(
  query: string,
  options: { flatten?: boolean } = {}
): Promise<T[]> {
  const flatten = options.flatten !== false;
  const result = await apiCall<{ status: string; data: any[] }>({
    method: 'POST',
    path: `/query`,
    body: { query },
  });
  const rows = result.data ?? [];
  if (!flatten) return rows as T[];
  return rows.map((entry: any) => {
    if (entry && typeof entry === 'object') {
      const keys = Object.keys(entry);
      // Catalyst wraps rows like { TableName: { ... } }. If a single key wraps
      // an object, unwrap it. Otherwise return as-is (e.g., aggregate queries).
      if (keys.length === 1 && entry[keys[0]] && typeof entry[keys[0]] === 'object') {
        return entry[keys[0]] as T;
      }
    }
    return entry as T;
  });
}

/**
 * Escape a string value for safe inline use in a ZCQL query. ZCQL has no
 * parameter binding, so every user-supplied string must pass through here.
 * Wrap the result in single quotes when used in WHERE clauses.
 */
export function zcqlEscapeValue(value: string): string {
  return String(value).replace(/'/g, "''");
}

/**
 * Catalyst ZCQL rejects LIMIT > 300. Controllers that fetch one extra row
 * to detect a "has more" page can request at most 299 user rows + 1 probe.
 * Use this to clamp any user-supplied limit before building a ZCQL query.
 */
export const ZCQL_MAX_LIMIT = 299;
export function zcqlSafeLimit(limit: number): number {
  return Math.min(Math.max(1, limit), ZCQL_MAX_LIMIT);
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

/**
 * Insert a row, retrying once without the given optional columns if the first
 * attempt fails. Lets controllers write columns (e.g. `isOfficial`) that may
 * not exist yet in the Catalyst schema — the insert still succeeds (minus those
 * columns) until they're added in the console. Mirror of updateRowTolerant.
 */
export async function insertRowTolerant(
  tableName: string,
  row: Record<string, any>,
  optionalColumns: string[] = []
): Promise<CatalystRow> {
  try {
    return await insertRow(tableName, row);
  } catch (err) {
    if (optionalColumns.some((k) => k in row)) {
      const rest = { ...row };
      for (const k of optionalColumns) delete rest[k];
      return await insertRow(tableName, rest);
    }
    throw err;
  }
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

/**
 * Update a row, retrying once without the given optional columns if the first
 * attempt fails. Lets controllers stamp audit columns (lastEditedById /
 * lastEditedAt) that may not exist yet in the Catalyst schema — the update
 * still succeeds (minus the audit stamp) until those columns are added.
 */
export async function updateRowTolerant(
  tableName: string,
  row: { ROWID: string | number; [column: string]: any },
  optionalColumns: string[] = []
): Promise<CatalystRow> {
  try {
    return await updateRow(tableName, row);
  } catch (err) {
    if (optionalColumns.some((k) => k in row)) {
      const rest = { ...row };
      for (const k of optionalColumns) delete rest[k];
      return await updateRow(tableName, rest);
    }
    throw err;
  }
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
