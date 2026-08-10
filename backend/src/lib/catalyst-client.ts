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
import { keysetPredicate, keysetOrderBy, type ListCursor, type SortDir } from './keyset';
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

/**
 * How many OAuth grants this process has performed.
 *
 * Exposed because it is the only way to tell a healthy token lifecycle from a
 * stampede: `tokenFetch` in the per-request perf line is computed BEFORE the
 * shared refresh is awaited, so N concurrent requests all report "fetched"
 * even when they correctly shared ONE grant. This counter measures the thing
 * that actually matters — how many times we hit the rate-limited endpoint.
 *
 * Worth alarming on in production: a grant rate that tracks request rate means
 * the single-flight guard has been broken.
 */
let oauthGrantCount = 0;
export function catalystOAuthGrantCount(): number {
  return oauthGrantCount;
}

/** Fetch a fresh access token via the refresh-token grant. */
function fetchAccessToken(): Promise<AccessTokenCache> {
  oauthGrantCount += 1;
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

/**
 * In-flight token refresh, shared by every caller that arrives while it runs.
 *
 * SINGLE-FLIGHT IS THE POINT. Without it, a cold or invalidated cache means
 * every concurrent request independently calls the OAuth endpoint. A list page
 * fans out into several parallel Catalyst calls, so one page load alone can
 * fire a handful of simultaneous grants — and Zoho rate-limits this endpoint.
 * That failure was observed directly in this project:
 *
 *     OAuth refresh failed: "You have made too many requests continuously.
 *     Please try again after some time"
 *
 * The dangerous version of that is a 401 storm: the token goes bad, every
 * in-flight request invalidates and refreshes at once, Zoho rate-limits the
 * grants, and the app cannot recover — a self-inflicted outage that gets WORSE
 * with traffic. One refresh, everyone else awaits it.
 */
let tokenRefreshInFlight: Promise<AccessTokenCache> | null = null;

/** Get a valid access token, using cache when possible. */
async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  if (!tokenRefreshInFlight) {
    tokenRefreshInFlight = fetchAccessToken().finally(() => {
      // Cleared whether it resolved or rejected, so a failed grant does not
      // wedge every future request onto a permanently-rejected promise.
      tokenRefreshInFlight = null;
    });
  }
  const fresh = await tokenRefreshInFlight;
  tokenCache = fresh;
  return fresh.token;
}

/**
 * Invalidate the cached token, but ONLY if it is still the one the caller used.
 *
 * Guards a second, subtler race. Request A gets a 401 and refreshes. Request B
 * was already in flight holding the OLD token, so it 401s too — a moment later,
 * after A has installed a good token. An unconditional `tokenCache = null`
 * there throws away A's fresh token and sends everyone back to the OAuth
 * endpoint, which is exactly the stampede the single-flight guard exists to
 * prevent. Comparing identity makes a late 401 a no-op.
 */
function invalidateTokenIfStale(usedToken: string | null): void {
  if (!usedToken) return;
  if (tokenCache && tokenCache.token !== usedToken) return; // already replaced
  tokenCache = null;
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
  /** Extra headers merged over the defaults (e.g. the ZCQL Accept header). */
  headers?: Record<string, string>;
}

/**
 * One Catalyst REST call, retrying ONCE on a 401.
 *
 * The token cache trusts `expires_in`, but a token can stop being accepted
 * before that window elapses — revoked, rotated, or simply a clock that
 * disagrees with Zoho's. When that happens there is no self-healing path: the
 * cache still believes the token is valid, so EVERY subsequent request 401s
 * until the process is restarted. Observed live on a container that had been up
 * 33 minutes — registration and every list started failing with
 * `INVALID_TOKEN` and stayed broken.
 *
 * AppSail containers run for hours, so "restart to recover" is not a strategy.
 * A 401 now discards the cached token and retries the call once; a second 401
 * is a genuine auth failure and propagates.
 */
/**
 * Ceiling on simultaneous in-flight Catalyst calls for this process.
 *
 * Catalyst enforces its own concurrency limit and answers 429
 * "Concurrency limit reached for the feature COMPONENT" once you cross it.
 * Measured: 30 simultaneous ZCQL queries → 4 rejected outright.
 *
 * That matters because this codebase deliberately fans out — scoped child
 * fetches, parallel stats aggregates, the history merge refilling three
 * sources, the notification sweep. Each of those made the app FASTER and the
 * burst WIDER. Without a ceiling, a busy moment turns a latency win into
 * dropped requests, which is a strictly worse trade.
 *
 * 8 is deliberately below the observed failure point: fast enough to keep the
 * parallel wins, narrow enough that the limiter — not Catalyst — is what
 * shapes the burst.
 */
const MAX_INFLIGHT_CATALYST_CALLS = 8;
let inflight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT_CATALYST_CALLS) {
    inflight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inflight += 1;
}

function releaseSlot(): void {
  inflight -= 1;
  const next = waiters.shift();
  if (next) next();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One Catalyst REST call: concurrency-limited, and retried on the two failures
 * that are transient by nature.
 *
 *   401 — the cached token stopped being accepted. Retried ONCE after
 *         invalidating precisely the token this call used.
 *   429 — Catalyst's concurrency limit. Retried with exponential backoff and
 *         jitter; the jitter matters because a synchronised retry from a whole
 *         fan-out would recreate the burst that caused the 429.
 *
 * Everything else propagates immediately — a 400 means the query is wrong and
 * retrying it just wastes time and hides the bug.
 */
async function apiCall<T = any>(opts: RequestOptions): Promise<T> {
  const MAX_429_RETRIES = 4;
  let attempt = 0;

  for (;;) {
    const used: { token: string | null } = { token: null };
    try {
      await acquireSlot();
      try {
        return await apiCallOnce<T>(opts, used);
      } finally {
        releaseSlot();
      }
    } catch (err: any) {
      if (err?.statusCode === 401 && attempt === 0) {
        console.warn(
          `[catalyst] 401 on ${opts.method} ${opts.path} — discarding the cached ` +
            'access token and retrying once.'
        );
        // Only drop the token this call actually used. A concurrent request may
        // already have installed a good one; see invalidateTokenIfStale.
        invalidateTokenIfStale(used.token);
        // The retry shares the single-flight refresh with every other 401'd
        // request, so a storm produces ONE grant, not one per request.
        attempt += 1;
        continue;
      }
      if (err?.statusCode === 429 && attempt < MAX_429_RETRIES) {
        // 100ms, 200ms, 400ms, 800ms — each ±50% jitter so a fan-out that was
        // throttled together does not retry together.
        const base = 100 * 2 ** attempt;
        const delay = Math.round(base * (0.5 + Math.random()));
        console.warn(
          `[catalyst] 429 on ${opts.method} ${opts.path} — backing off ${delay}ms ` +
            `(attempt ${attempt + 1}/${MAX_429_RETRIES})`
        );
        attempt += 1;
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

async function apiCallOnce<T = any>(
  opts: RequestOptions,
  used?: { token: string | null }
): Promise<T> {
  // Diagnostic: did this call have to mint a fresh OAuth token (cold token cache)?
  const tokenWasCached = !!(tokenCache && tokenCache.expiresAt > Date.now());
  const token = await getAccessToken();
  const tokenFetched = !tokenWasCached;
  // Record which token this attempt used, so a 401 can invalidate precisely
  // that one rather than whatever happens to be cached when the error lands.
  if (used) used.token = token;

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
  // Caller-supplied headers win — Content-Length is computed above and must
  // not be overridden, so callers simply don't pass it.
  if (opts.headers) Object.assign(headers, opts.headers);

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

/** IST is the Catalyst project timezone (Asia/Kolkata) — see .catalystrc. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Format a Date / string as Catalyst requires: `YYYY-MM-DD HH:mm:ss`.
 *
 * Catalyst datetime columns are TIMEZONE-NAIVE — whatever string you write is
 * the string you read back — and Catalyst stamps its own CREATEDTIME /
 * MODIFIEDTIME in the project timezone (IST). So every datetime this app writes
 * must be IST too, or app-written and Catalyst-written timestamps on the same
 * row describe different moments.
 *
 * The old implementation used HOST-LOCAL getters (`getHours()` …). On a dev
 * box in India that happens to be IST and looks fine; on an AppSail container
 * running UTC it writes UTC. Measured on real production rows:
 *
 *     verifiedAt = 2026-05-01 10:27:39      (written by us, UTC)
 *     MODIFIEDTIME = 2026-05-01 15:57:39    (written by Catalyst, IST)
 *
 * — a silent 5h30m error on every action timestamp, which then sorted and
 * displayed 5.5 hours early. Converting explicitly makes the output identical
 * regardless of the host's TZ.
 *
 * Two input shapes are passed through WITHOUT timezone maths, because for them
 * a conversion would be wrong rather than right:
 *
 *   - A bare `YYYY-MM-DD` means a DAY, not an instant. The old code ran it
 *     through `new Date()` (which parses it as UTC midnight) and then applied
 *     the local offset, so `'2026-09-01'` was stored as `2026-09-01 05:30:00` —
 *     a date field with a spurious 5.5h time on it, even on an IST host.
 *   - An already-formatted zone-less datetime is what the caller means
 *     literally; re-parsing it would shift it by the offset every round trip.
 */
export function toCatalystDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const s = value.trim();
    const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnly) return `${dateOnly[1]} 00:00:00`;
    // Zone-less `YYYY-MM-DD HH:mm:ss[:SSS]` (Catalyst's own read-back form).
    const naive = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:[.:]\d+)?$/);
    if (naive) return `${naive[1]} ${naive[2]}`;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  // Shift the INSTANT into IST, then read it with UTC getters. Host TZ never
  // enters the calculation.
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`
  );
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
 * ZCQL condition matching `column` against ANY of `values` (OR-chained
 * equality; Catalyst ZCQL has no reliable IN operator). Values are escaped.
 * Used for identity-alias matching (a user's ROWID + legacy UUID).
 */
export function zcqlAnyOf(column: string, values: string[]): string {
  const clauses = values.map((v) => `${column} = '${zcqlEscapeValue(v)}'`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
}

/**
 * Escape a value for use inside a ZCQL LIKE pattern.
 *
 * `*` is the ZCQL wildcard, so a user typing it would otherwise turn their
 * search into a match-everything pattern. Catalyst offers no escape syntax for
 * it, so strip it. `%` is a LITERAL character in ZCQL (see zcqlLike) and needs
 * no special handling.
 */
export function zcqlLikeValue(value: string): string {
  return zcqlEscapeValue(String(value).replace(/\*/g, ''));
}

/**
 * Build a ZCQL LIKE condition.
 *
 * ⚠️ THE WILDCARD IS `*`, NOT `%`. This is the single most dangerous quirk in
 * Catalyst ZCQL, because using `%` does not error — it silently matches ZERO
 * rows. Verified directly against the live datastore:
 *
 *     passengerName LIKE 'ProbePax*'   ->  8 rows
 *     passengerName LIKE 'ProbePax%'   ->  0 rows      (no error!)
 *     passengerName LIKE '*ProbePax*'  ->  8 rows
 *
 * Every search in this codebase was originally written with `%`, which is why
 * text search had to be routed through a "read the whole table and filter in
 * JS" fallback to work at all. Always build LIKE conditions through this
 * helper so that mistake cannot be reintroduced.
 *
 * `prefix` mode is anchored and therefore cheaper for the datastore to satisfy;
 * `contains` is unanchored. Matching is case-insensitive.
 */
export function zcqlLike(
  column: string,
  term: string,
  mode: 'contains' | 'prefix' = 'contains'
): string {
  const value = zcqlLikeValue(term);
  return mode === 'prefix'
    ? `${column} LIKE '${value}*'`
    : `${column} LIKE '*${value}*'`;
}

/** OR-chained LIKE across several columns — the usual "search box" shape. */
export function zcqlLikeAny(
  columns: string[],
  term: string,
  mode: 'contains' | 'prefix' = 'contains'
): string {
  const clauses = columns.map((c) => zcqlLike(c, term, mode));
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
}

/**
 * Build a multi-column search clause that FITS the remaining condition budget.
 *
 * Each searched column costs one condition, and the WHERE clause allows only
 * 10 in total (see MAX_ZCQL_CONDITIONS). A wide search plus a status filter
 * plus a date range plus staff scoping silently pushes past that and Catalyst
 * 400s the entire query — the user sees "no results" for data that exists.
 *
 * Rather than fail, drop the lowest-priority columns and TELL the caller which
 * ones went. Order `columns` most-identifying first (reference number, name,
 * phone) so the columns people actually search survive.
 */
export function zcqlSearchWithinBudget(
  columns: string[],
  term: string,
  conditionsAlreadyUsed: number,
  mode: 'contains' | 'prefix' = 'contains'
): { clause: string | null; dropped: string[] } {
  const remaining = MAX_ZCQL_CONDITIONS - conditionsAlreadyUsed;
  if (remaining < 1 || columns.length === 0) {
    return { clause: null, dropped: [...columns] };
  }
  const kept = columns.slice(0, remaining);
  const dropped = columns.slice(remaining);
  if (dropped.length > 0) {
    console.warn(
      `[catalyst] search narrowed to ${kept.length} column(s) to stay within the ` +
        `${MAX_ZCQL_CONDITIONS}-condition limit; not searching: ${dropped.join(', ')}`
    );
  }
  return { clause: zcqlLikeAny(kept, term, mode), dropped };
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

/**
 * Catalyst ZCQL rejects a WHERE clause containing more than 10 LEAF conditions:
 *   "More than 10 conditions are not allowed in the query"
 *
 * VERIFIED against the live datastore. Critical details, all measured:
 *   - OR terms and AND terms draw on the SAME budget (10 total, not 10 each).
 *   - Parentheses/nesting do NOT create a fresh budget.
 *   - It is a hard 400, so an over-budget query returns NOTHING.
 *
 * This is easy to blow without noticing. A grievance search over 7 columns
 * (7) + a status filter (1) + a date range (2) is exactly 10 — adding staff
 * ownership scoping makes 11 and the whole search fails. Likewise an
 * OR-chained "fetch children for these parent ids" can only carry 10 ids per
 * query, which is why child fetches must chunk by 10, not 25.
 *
 * Budget every generated WHERE clause against this. Where a builder might
 * exceed it, prefer failing loudly (assertConditionBudget) or shedding
 * deliberately and visibly — never let it become a silent empty result.
 */
export const MAX_ZCQL_CONDITIONS = 10;

/**
 * Count leaf conditions in a set of WHERE clause fragments.
 *
 * Deliberately conservative: it counts comparison operators rather than
 * parsing, so it may over- but never under-count in the shapes this codebase
 * generates. Over-counting is the safe direction — it errs toward shedding a
 * clause rather than toward a 400.
 */
export function countZcqlConditions(clauses: string[]): number {
  return clauses.reduce((total, clause) => {
    // Strip quoted literals BEFORE counting operators. Without this the count
    // includes operators that appear inside USER DATA: someone searching for
    // "like" or ">=" inflates the structural count of their own query.
    //
    // That had two consequences, both user-triggerable and neither obvious:
    //   - the inflated count could exceed the budget and make
    //     assertConditionBudget throw, turning a search box into an HTTP 500
    //     (reproduced with search=`o'brien * % _ LIKE >= AND OR`);
    //   - it also feeds zcqlSearchWithinBudget, so those users silently got
    //     FEWER columns searched than everyone else.
    //
    // `'(?:[^']|'')*'` matches a ZCQL literal including doubled-quote escapes,
    // which is exactly what zcqlEscapeValue produces.
    const structural = clause.replace(/'(?:[^']|'')*'/g, "''");
    const matches = structural.match(
      /(>=|<=|!=|\bLIKE\b|\bIS NOT NULL\b|\bIS NULL\b|[<>=])/gi
    );
    return total + (matches ? matches.length : 0);
  }, 0);
}

/**
 * Throw if a WHERE clause set would exceed the condition budget.
 *
 * Use on paths where exceeding the budget indicates a bug rather than a
 * legitimate user query — a loud failure in dev beats a 400 in production.
 */
export function assertConditionBudget(clauses: string[], context = 'query'): string[] {
  const n = countZcqlConditions(clauses);
  if (n > MAX_ZCQL_CONDITIONS) {
    throw new Error(
      `ZCQL condition budget exceeded in ${context}: ${n} conditions ` +
        `(max ${MAX_ZCQL_CONDITIONS}). Reduce filters or narrow the search columns.`
    );
  }
  return clauses;
}

/**
 * Like zcqlSafeLimit but THROWS instead of clamping.
 *
 * Silent clamping is how rows disappear: ask for limit=1000 and
 * zcqlSafeLimit quietly returns 299 while the response meta still echoes
 * 1000, so page 1 yields rows 0-298, page 2 (skip=1000) yields rows
 * 1000-1298, and rows 299-999 are returned by no page at all. Nothing
 * errors; the data is simply gone. New code should compute a limit it knows
 * is legal and assert it, so a mistake is a stack trace instead of missing
 * records.
 */
export function assertZcqlLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 300) {
    throw new Error(
      `ZCQL LIMIT ${limit} is out of range (1-300). Clamp the page size before building the query.`
    );
  }
  return limit;
}

/**
 * Execute an aggregate query through Catalyst's OLAP variant of /query.
 *
 * NOTE: verified unavailable on this deployment — it answers
 * `{"message":"OLAP System is not available"}`. Kept only as a fallback for
 * environments where it is enabled; `countRows` below uses plain ZCQL, which
 * does work. Do not build anything on this without probing first.
 */
export async function executeOLAP<T = any>(query: string): Promise<T[]> {
  const result = await apiCall<{ status: string; data: any[] }>({
    method: 'POST',
    path: `/query`,
    body: { query, OLAP: true },
    headers: { Accept: 'application/vnd.catalyst.v2+zcql' },
  });
  return (result.data ?? []) as T[];
}

/** Whether COUNT works here. Probed once per process; null = not yet known. */
let countSupported: boolean | null = null;

/**
 * Real `SELECT COUNT(ROWID)` for a table + WHERE clause.
 *
 * VERIFIED WORKING against the live datastore: plain ZCQL returns
 * `[{"COUNT(ROWID)":19}]`, and it honours a WHERE clause. This matters
 * because three places in this codebase assert that "Catalyst ZCQL COUNT() /
 * GROUP BY are unreliable" and fall back to reading whole tables and counting
 * in JS — see history.controller.ts and stats.controller.ts. That belief is
 * measurably wrong for COUNT, and it is why totals cost a full table read
 * today. (The OLAP endpoint really is unavailable here, which is likely what
 * the original comments actually hit.)
 *
 * Returns null — never throws, never guesses — when the count cannot be
 * obtained. Returning null IS the contract: callers must render a list
 * without a total, because a fabricated total is worse than an absent one.
 *
 * `whereSql` must include its own leading " WHERE " (or be empty), and must be
 * the SAME predicate used for the page query — a count that disagrees with the
 * rows on screen is its own bug.
 */
export async function countRows(
  tableName: string,
  whereSql: string
): Promise<number | null> {
  if (countSupported === false) return null;

  // Catalyst aliases the aggregate column as "COUNT(ROWID)" and may or may not
  // nest it under the table name — dig the number out rather than assume a key.
  const attempt = async (sql: string): Promise<number | null> => {
    try {
      const rows = await executeZCQL<Record<string, unknown>>(sql);
      return findFirstNumber(rows[0]);
    } catch {
      return null;
    }
  };

  const found = await attempt(`SELECT COUNT(ROWID) FROM ${tableName}${whereSql}`);
  if (found !== null) {
    countSupported = true;
    return found;
  }

  // This particular query failed. Distinguish "this predicate/table is bad"
  // from "the platform cannot COUNT at all" — ONLY the latter may disable
  // counting globally.
  //
  // Getting this wrong is expensive: an earlier version latched
  // countSupported=false on ANY failure, so one over-budget WHERE or one
  // missing column anywhere in the app silently stripped the total off EVERY
  // list for the rest of the process's life. That is the same
  // one-failure-poisons-everything shape this module exists to remove.
  if (countSupported === true) return null; // platform is fine; this query isn't

  const probe = await attempt(`SELECT COUNT(ROWID) FROM ${tableName}`);
  if (probe !== null) {
    countSupported = true; // COUNT works — the caller's predicate was the problem
    return null;
  }

  countSupported = false;
  console.warn(
    `[catalyst] COUNT appears unsupported (probe on ${tableName} also failed) — ` +
      'lists will render without a total.'
  );
  return null;
}

/**
 * Inclusive date-range WHERE clauses for a Catalyst datetime column.
 *
 * Use this instead of hand-building `col >= start AND col <= end`. Two traps it
 * closes, both of which silently DROP rows rather than erroring:
 *
 *  1. `toCatalystDate('2026-08-07')` yields a MIDNIGHT timestamp, so using it
 *     as a `<=` bound excludes everything that happened during the end date —
 *     "show me today's entries" returns nothing.
 *
 *  2. Naively patching that to `<= '<end> 23:59:59'` is STILL wrong, because
 *     real CREATEDTIME values carry milliseconds after a colon
 *     ('2026-07-13 15:41:05:801'). Comparison is lexicographic, so
 *     '23:59:59:801' > '23:59:59' and the last second of the day is dropped.
 *
 * The half-open upper bound (`< next-day midnight`) is correct regardless of
 * whether the column stores milliseconds, seconds, or a bare date.
 */
export function dateRangeClauses(
  column: string,
  startDate?: string | null,
  endDate?: string | null
): string[] {
  const clauses: string[] = [];
  const start = toCatalystDate(startDate ?? undefined);
  if (start) clauses.push(`${column} >= '${start.slice(0, 10)} 00:00:00'`);

  const end = toCatalystDate(endDate ?? undefined);
  if (end) {
    // Half-open: strictly BEFORE the day after `endDate`.
    const d = new Date(`${end.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    clauses.push(`${column} < '${d.toISOString().slice(0, 10)} 00:00:00'`);
  }
  return clauses;
}

/**
 * `SELECT <column>, COUNT(ROWID) ... GROUP BY <column>` — one round-trip
 * instead of reading a whole table and tallying in JS.
 *
 * VERIFIED WORKING on the live datastore:
 *   SELECT status, COUNT(ROWID) FROM Grievance GROUP BY status
 *     -> [{RESOLVED:39},{OPEN:68},{REJECTED:1},{IN_PROGRESS:1}]
 *
 * Returns null (never throws) when the aggregate is unavailable, so callers
 * keep a working fallback. NOTE: `COUNT(*)` is rejected by Catalyst — always
 * count ROWID — and date functions like MONTH() are a syntax error, so
 * month/day buckets must be expressed as ranged COUNTs instead.
 *
 * The grouped key can be null for rows where the column is unset; callers must
 * map that back to whatever default their JS version used, or a chart gains a
 * phantom slice.
 */
export async function groupCount(
  tableName: string,
  column: string,
  whereSql = ''
): Promise<Array<{ key: string | null; count: number }> | null> {
  try {
    const rows = await executeZCQL<Record<string, unknown>>(
      `SELECT ${column}, COUNT(ROWID) FROM ${tableName}${whereSql} GROUP BY ${column}`
    );
    return rows.map((r) => {
      const flat = (r && typeof r === 'object' && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
      let key: string | null = null;
      let count = 0;
      for (const [k, v] of Object.entries(flat)) {
        if (k === column) key = v === null || v === undefined ? null : String(v);
        else {
          const n = findFirstNumber(v);
          if (n !== null) count = n;
        }
      }
      return { key, count };
    });
  } catch (err) {
    console.warn(
      `[catalyst] GROUP BY unavailable for ${tableName}.${column}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Fetch child rows for a set of parent ids, scoped and chunked.
 *
 * The generic form of the fix that removed the biggest latency source in the
 * Train EQ module: reading a WHOLE child table to decorate one page of parents
 * costs O(child table), forever. This costs O(page size).
 *
 * Chunks are issued in parallel. A chunk that comes back exactly at the ZCQL
 * limit may have been truncated, so it is split and retried rather than
 * silently dropping children.
 */
export async function fetchChildrenByParentIds(
  tableName: string,
  foreignKeyColumn: string,
  parentIds: string[],
  options: { orderBy?: string; chunkSize?: number } = {}
): Promise<CatalystRow[]> {
  const ids = [...new Set(parentIds.filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  // Never exceed the WHERE-clause condition budget: each id is one OR term.
  const chunkSize = Math.min(options.chunkSize ?? MAX_ZCQL_CONDITIONS, MAX_ZCQL_CONDITIONS);
  const orderBy = options.orderBy ?? 'ORDER BY ROWID ASC';

  async function fetchChunk(chunk: string[]): Promise<CatalystRow[]> {
    let rows: CatalystRow[];
    try {
      rows = await executeZCQL<CatalystRow>(
        `SELECT * FROM ${tableName} WHERE ${zcqlAnyOf(foreignKeyColumn, chunk)} ` +
          `${orderBy} LIMIT ${ZCQL_MAX_LIMIT}`
      );
    } catch (err) {
      // Tolerate ONLY "this table/column does not exist" — the pre-existing
      // behaviour for datastores where the child table was never provisioned.
      // Anything else (notably the 10-condition limit) must surface: swallowing
      // it here is how a chunk silently returned zero children and rows went
      // missing with no error anywhere.
      const msg = err instanceof Error ? err.message : String(err);
      if (/Unkown Table|No such Table/i.test(msg)) return [];
      throw err;
    }
    // A completely full page may have been truncated by the LIMIT.
    if (rows.length >= ZCQL_MAX_LIMIT && chunk.length > 1) {
      const mid = Math.ceil(chunk.length / 2);
      const [a, b] = await Promise.all([
        fetchChunk(chunk.slice(0, mid)),
        fetchChunk(chunk.slice(mid)),
      ]);
      return [...a, ...b];
    }
    return rows;
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const results = await Promise.all(chunks.map(fetchChunk));
  return results.flat();
}

/**
 * Fetch a page-window of `want` rows starting at `skip`, using a KEYSET walk.
 *
 * Exists because the list contract allows limits up to 1000 while ZCQL rejects
 * LIMIT > 300, so a large window has to be assembled from several queries.
 *
 * IT DOES NOT USE OFFSET, AND THAT IS THE WHOLE POINT.
 *
 * Catalyst's OFFSET is NOT STABLE — measured on a 2067-row table, with a full
 * total order (`ORDER BY CREATEDTIME DESC, ROWID DESC`) and no concurrent
 * writes:
 *
 *     chunked OFFSET walk :  2068 rows, 2067 unique   ← a row came back twice
 *     keyset walk         :  2067 rows, 2067 unique   ← exact
 *
 * So the obvious implementation (LIMIT 299 OFFSET 0 / 299 / 598 …) silently
 * duplicates rows at chunk boundaries, which on a paged screen means one record
 * shown twice and — since the page size is fixed — another pushed off the end.
 * A tiebreaker in ORDER BY does NOT fix it; the instability is in OFFSET itself.
 *
 * A keyset walk anchors each batch to the last row of the previous one, so
 * boundaries cannot drift. Skipping to `skip` costs walking those rows, but
 * `skip + want` is bounded by the 1000-row contract (~7 queries worst case),
 * and correctness is not negotiable here.
 *
 * `timeColumn` must be the column the caller sorts by, and `sort` must match
 * the direction — the predicate and the ORDER BY have to agree or the walk
 * skips rows.
 */
export async function fetchOffsetWindow(
  tableName: string,
  whereSql: string,
  timeColumn: string,
  sort: SortDir,
  skip: number,
  want: number
): Promise<CatalystRow[]> {
  const collected: CatalystRow[] = [];
  let cursor: ListCursor | null = null;
  let skipped = 0;
  const target = skip + want;
  // Hard stop: (skip + want) is bounded by the 1000-row list contract, so this
  // can never exceed ~7 iterations. The guard is purely a runaway backstop.
  const MAX_PAGES = 64;

  for (let i = 0; i < MAX_PAGES && collected.length < want; i++) {
    const clauses: string[] = [];
    if (whereSql) clauses.push(whereSql.replace(/^\s*WHERE\s+/i, ''));
    if (cursor) clauses.push(keysetPredicate(timeColumn, cursor, sort));
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';

    const batchSize = Math.min(ZCQL_MAX_LIMIT, target - skipped - collected.length);
    if (batchSize < 1) break;

    const batch = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${tableName}${where} ${keysetOrderBy(timeColumn, sort)} ` +
        `LIMIT ${assertZcqlLimit(batchSize)}`
    );
    if (batch.length === 0) break;

    for (const row of batch) {
      if (skipped < skip) skipped++;
      else if (collected.length < want) collected.push(row);
    }

    const last = batch[batch.length - 1];
    const t = String(last[timeColumn] ?? '');
    const r = String(last.ROWID ?? '');
    if (!t || !r) break; // cannot build a cursor — stop rather than loop forever
    cursor = { t, r };
    if (batch.length < batchSize) break; // ran out of rows
  }
  return collected;
}

/**
 * Read EVERY row matching a predicate, walking by ROWID.
 *
 * The "read all matching rows" counterpart to fetchOffsetWindow. Same reason
 * for existing: the obvious `LIMIT 299 OFFSET n` loop silently duplicates rows
 * at chunk boundaries on Catalyst (measured: 2068 returned / 2067 unique on a
 * 2067-row table). Seeking on ROWID cannot drift, because each batch asks for
 * strictly-greater ids than the last one it saw.
 *
 * ROWID is unique and monotonic, so `ORDER BY ROWID ASC` is already a total
 * order and needs no tiebreaker. Costs one condition against the 10-condition
 * WHERE budget.
 *
 * Returns `truncated: true` if the page cap was hit — callers MUST surface
 * that rather than treat a capped read as a complete one.
 */
export async function walkRowsByRowId(
  tableName: string,
  whereSql: string,
  options: { maxPages?: number } = {}
): Promise<{ rows: CatalystRow[]; truncated: boolean }> {
  const maxPages = options.maxPages ?? 40; // ~12k rows
  const base = whereSql.replace(/^\s*WHERE\s+/i, '').trim();
  const rows: CatalystRow[] = [];
  let lastRowId: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const clauses: string[] = [];
    if (base) clauses.push(base);
    // ROWID is interpolated bare (numeric literal); it comes from Catalyst
    // itself, never from user input.
    if (lastRowId) clauses.push(`ROWID > ${lastRowId}`);
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';

    const batch = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${tableName}${where} ORDER BY ROWID ASC ` +
        `LIMIT ${assertZcqlLimit(ZCQL_MAX_LIMIT)}`
    );
    if (batch.length === 0) return { rows, truncated: false };
    rows.push(...batch);
    if (batch.length < ZCQL_MAX_LIMIT) return { rows, truncated: false };
    lastRowId = String(batch[batch.length - 1].ROWID);
  }
  return { rows, truncated: true };
}

/** Group rows by a foreign-key column — the usual companion to the above. */
export function groupByColumn(
  rows: CatalystRow[],
  column: string
): Map<string, CatalystRow[]> {
  const out = new Map<string, CatalystRow[]>();
  for (const r of rows) {
    const k = r[column];
    if (k === null || k === undefined) continue;
    const key = String(k);
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(r);
  }
  return out;
}

/**
 * Whether a column exists on a table, cached per process.
 *
 * Needed because ZCQL rejects the WHOLE query with a 400 when it references an
 * unknown column, so one optional column can take down an entire search. The
 * live example: `TrainRequest.trainRequestNumber` does not exist in the
 * Development datastore, so any predicate mentioning it fails outright.
 */
const columnExistsCache = new Map<string, boolean>();

export async function columnExists(
  tableName: string,
  column: string
): Promise<boolean> {
  const key = `${tableName}.${column}`;
  const cached = columnExistsCache.get(key);
  if (cached !== undefined) return cached;
  try {
    await executeZCQL(`SELECT ${column} FROM ${tableName} LIMIT 1`);
    columnExistsCache.set(key, true);
    return true;
  } catch {
    columnExistsCache.set(key, false);
    console.warn(`[catalyst] column ${key} is absent — queries will omit it.`);
    return false;
  }
}

/** Depth-limited search for the first finite numeric value in a response row. */
function findFirstNumber(value: unknown, depth = 0): number | null {
  if (depth > 3 || value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = findFirstNumber(v, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
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
