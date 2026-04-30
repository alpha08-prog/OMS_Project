import catalystSDK from 'zcatalyst-sdk-node';
import https from 'https';
import type { Request } from 'express';

type CatalystApp = ReturnType<typeof catalystSDK.initializeApp>;

/**
 * SDK bug workarounds applied to every outgoing https.request once at module
 * load.
 *
 *   1. zcatalyst-sdk-node v3.4.0 appends `&next_token=` (empty) to
 *      getPagedRows requests; Catalyst rejects with HTTP 400 HTML. Strip it.
 *
 *   2. The same SDK builds the Accept header by concatenating its own value
 *      + ', ' + (existing || ''), which yields a trailing `, ` when no
 *      existing Accept is present (e.g. `application/vnd.catalyst.v2+json, `).
 *      Catalyst's Tomcat parses Accept strictly and returns the default
 *      HTML 400 page on POST/PUT (not GET) with that trailing comma. Trim it.
 */
(() => {
  const original = https.request;
  (https as any).request = function (...args: any[]) {
    const opts = args[0];
    if (opts && typeof opts === 'object' && typeof opts.path === 'string') {
      opts.path = opts.path
        .replace(/[?&]next_token=(?=&|$)/g, '')   // strip empty next_token
        .replace(/\?$/, '');                       // trailing '?'

      if (opts.headers) {
        const acceptKey = 'Accept' in opts.headers ? 'Accept' : ('accept' in opts.headers ? 'accept' : null);
        if (acceptKey && typeof opts.headers[acceptKey] === 'string') {
          opts.headers[acceptKey] = (opts.headers[acceptKey] as string).replace(/,\s*$/, '');
        }
      }

      // SDK bug workaround: zcatalyst-sdk-node@3.4.0 calls POST /bucket/signature
      // with type:'json' and no body field, so the SDK's _request() takes the
      // `data === undefined` branch and calls req.end() with no payload.
      // Catalyst's Tomcat rejects empty POST bodies (Content-Type: application/json
      // with Content-Length:0) by serving the default HTML 400 page. We inject
      // an empty JSON object body to satisfy the parser.
      (opts as any).__omsInjectEmptyJsonBody =
        typeof opts.method === 'string' &&
        opts.method.toUpperCase() === 'POST' &&
        opts.path.includes('/bucket/signature');
      if ((opts as any).__omsInjectEmptyJsonBody) {
        opts.headers = opts.headers || {};
        opts.headers['Content-Length'] = '2';
        if (!('Content-Type' in opts.headers) && !('content-type' in opts.headers)) {
          opts.headers['Content-Type'] = 'application/json';
        }
      }

      // Diagnostic: log every Stratus-relevant outbound request so we can see
      // exactly what the SDK is sending when uploads fail.
      if (
        process.env.OMS_DEBUG_STRATUS === '1' &&
        (opts.path.includes('/bucket') || (opts.host || opts.hostname || '').includes('stratus'))
      ) {
        const safeHeaders = { ...(opts.headers || {}) };
        if (safeHeaders.Authorization) safeHeaders.Authorization = '<redacted>';
        if (safeHeaders.authorization) safeHeaders.authorization = '<redacted>';
        // eslint-disable-next-line no-console
        console.log('[stratus-debug] outbound', {
          method: opts.method,
          host: opts.host || opts.hostname,
          port: opts.port,
          path: opts.path,
          headers: safeHeaders,
        });
      }
    }
    const req = original.apply(https, args as any);
    // Pre-write the `{}` body so the SDK's later req.end() finalizes the
    // request with the body already in the buffer. We set Content-Length:2
    // above so Node sends a content-length-framed body, not chunked.
    if (opts && (opts as any).__omsInjectEmptyJsonBody && req && typeof (req as any).write === 'function') {
      try {
        (req as any).write('{}');
      } catch {
        // best-effort — if write fails the SDK's req.end() still runs
      }
    }
    return req;
  };
})();

/**
 * Detect whether the process is running inside Catalyst (AppSail / Functions).
 * Catalyst injects a few well-known env vars at runtime; we use those as a flag.
 */
function isInsideCatalyst(): boolean {
  return Boolean(
    process.env.X_ZOHO_CATALYST_LISTEN_PORT ||
      process.env.CATALYST_PROJECT_KEY_NAME ||
      process.env.X_ZC_PROJECT_KEY
  );
}

/**
 * Cached app instance for local dev. Created once on first request and reused —
 * the underlying access-token refresh is handled by the SDK.
 */
let cachedLocalApp: CatalystApp | null = null;

function getLocalApp(): CatalystApp {
  if (cachedLocalApp) return cachedLocalApp;

  const required = [
    'CATALYST_PROJECT_ID',
    'CATALYST_CLIENT_ID',
    'CATALYST_CLIENT_SECRET',
    'CATALYST_REFRESH_TOKEN',
  ];
  for (const k of required) {
    if (!process.env[k]) {
      throw new Error(
        `Catalyst credentials missing: ${k}. Set it in .env or run inside AppSail.`
      );
    }
  }

  const credential = catalystSDK.credential.refreshToken({
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
  });

  cachedLocalApp = catalystSDK.initializeApp({
    project_id: process.env.CATALYST_PROJECT_ID!,
    project_key:
      process.env.CATALYST_PROJECT_KEY || process.env.CATALYST_PROJECT_ID!,
    project_domain:
      process.env.CATALYST_API_DOMAIN || 'api.catalyst.zoho.in',
    environment: process.env.CATALYST_ENVIRONMENT || 'Development',
    credential,
  });

  return cachedLocalApp;
}

/**
 * Initialize the Catalyst SDK for the current request.
 *
 * Two modes:
 *   - Inside AppSail / Functions: SDK reads context from `req` automatically
 *   - Local dev:                  SDK is bootstrapped from env-var credentials (cached)
 *
 * Catalyst SDK is request-scoped in AppSail mode but app-scoped in admin mode,
 * so we hide that detail behind one helper.
 */
export function getCatalystApp(req: Request): CatalystApp {
  if (isInsideCatalyst()) {
    if (!req) {
      throw new Error('getCatalystApp() requires the Express Request inside AppSail');
    }
    return catalystSDK.initialize(req as unknown as { [x: string]: unknown });
  }
  return getLocalApp();
}

/**
 * Get a table handle for CRUD operations.
 * Replaces: prisma.<modelName>
 */
export function getTable(req: Request, tableName: string) {
  return getCatalystApp(req).datastore().table(tableName);
}

/**
 * Execute a ZCQL query (SQL-like syntax for Catalyst Data Store).
 * Use this for filtered SELECTs, JOINs (max 4), and aggregates.
 */
export async function executeQuery<T = unknown>(
  req: Request,
  zcql: string
): Promise<T[]> {
  const app = getCatalystApp(req);
  const result = await app.zcql().executeZCQLQuery(zcql);
  return (result as unknown) as T[];
}

/**
 * Retry wrapper for transient errors.
 * Mirrors prisma.ts withRetry() so callers can swap freely.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isTransient =
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ECONNRESET' ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('network');
      if (isTransient && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Escape a string value for safe interpolation into a ZCQL query.
 * ZCQL has no parameter binding, so all user input must be escaped manually.
 */
export function zcqlEscape(value: string): string {
  return String(value).replace(/'/g, "''");
}

/**
 * Format a Date / ISO string into Catalyst's required datetime format.
 * Catalyst expects:  YYYY-MM-DD HH:mm:ss   (no T, no Z, no milliseconds)
 * ISO 8601 input gets rejected with "Invalid input value ... datetime expected".
 */
export function toCatalystDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
