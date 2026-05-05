/**
 * Probes the IN-DC Stratus admin API to figure out which call shapes
 * actually work and which return Tomcat HTML 400.
 *
 * Run from backend/:  npx ts-node scripts/test-stratus-presigned-put.ts
 */
import 'dotenv/config';
import https from 'https';

let DEBUG_LOG = false;

// ─────────────────────────────────────────────────────────────────────────────
// SDK monkey-patches.
//
//   A. strip empty `next_token=`        (catalyst.ts has it)
//   B. trim trailing `, ` from Accept   (catalyst.ts has it)
//   C. log every outgoing request and pull headers + first 400 bytes of body
//      so we can see WHAT the SDK is actually sending
//   D. for the POST /bucket/signature inject `{}` body  (catalyst.ts has it)
//   E. NEW for this probe: for *every* /bucket/* admin call that has no body,
//      inject `{}` so we can see whether the body-emptiness is what trips
//      Tomcat on PUT /bucket/object/signed-url too.
// ─────────────────────────────────────────────────────────────────────────────
const _origReq = https.request;
(https as any).request = function (...args: any[]) {
  const opts = args[0];
  let inject = false;
  if (opts && typeof opts === 'object' && typeof opts.path === 'string') {
    opts.path = opts.path.replace(/[?&]next_token=(?=&|$)/g, '').replace(/\?$/, '');
    if (opts.headers) {
      const acceptKey = 'Accept' in opts.headers ? 'Accept' : ('accept' in opts.headers ? 'accept' : null);
      if (acceptKey && typeof opts.headers[acceptKey] === 'string') {
        opts.headers[acceptKey] = (opts.headers[acceptKey] as string).replace(/,\s*$/, '');
      }
    }
    const method = String(opts.method || '').toUpperCase();
    const isAdminBucketCall =
      opts.path.includes('/baas/') &&
      opts.path.includes('/bucket') &&
      (method === 'POST' || method === 'PUT' || method === 'DELETE');
    const hasContentLength =
      opts.headers && (opts.headers['Content-Length'] || opts.headers['content-length']);
    if (isAdminBucketCall && !hasContentLength) {
      opts.headers = opts.headers || {};
      opts.headers['Content-Length'] = '2';
      if (!('Content-Type' in opts.headers) && !('content-type' in opts.headers)) {
        opts.headers['Content-Type'] = 'application/json';
      }
      inject = true;
    }
    if (DEBUG_LOG) {
      const safe = { ...(opts.headers || {}) };
      if (safe.Authorization) safe.Authorization = '<redacted>';
      if (safe.authorization) safe.authorization = '<redacted>';
      console.log('  [outbound]', opts.method, (opts.host || opts.hostname) + opts.path);
      console.log('  [headers]', safe);
    }
  }
  const req = _origReq.apply(https, args as any);
  if (inject) {
    try { (req as any).write('{}'); } catch {}
  }
  return req;
};

import catalystSDK from 'zcatalyst-sdk-node';

async function main() {
  console.log('=== Stratus admin-API probe (IN DC) ===\n');

  const required = [
    'CATALYST_PROJECT_ID',
    'CATALYST_CLIENT_ID',
    'CATALYST_CLIENT_SECRET',
    'CATALYST_REFRESH_TOKEN',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Missing env vars:', missing.join(', '));
    process.exit(1);
  }

  const credential = catalystSDK.credential.refreshToken({
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
  });

  const app = catalystSDK.initializeApp({
    project_id: process.env.CATALYST_PROJECT_ID!,
    project_key:
      process.env.CATALYST_PROJECT_KEY || process.env.CATALYST_PROJECT_ID!,
    project_domain:
      process.env.CATALYST_API_DOMAIN || 'api.catalyst.zoho.in',
    environment: process.env.CATALYST_ENVIRONMENT || 'Development',
    credential,
  });

  const bucketName = process.env.OMS_STRATUS_BUCKET ?? process.env.STRATUS_BUCKET ?? 'oms-attachments';
  const bucket = app.stratus().bucket(bucketName);
  console.log('  project_id =', process.env.CATALYST_PROJECT_ID);
  console.log('  api domain =', process.env.CATALYST_API_DOMAIN || 'api.catalyst.zoho.in');
  console.log('  bucket     =', bucketName);
  console.log('  bucket_url =', (bucket as any).bucketDetails?.bucket_url);
  console.log();

  // We want a key that already exists (so GET signed-url has something to
  // sign). Use a known prefix from the screenshot ("grievance/" / "tour/")
  // — but signed-url generation doesn't actually require the object to
  // exist, so any key works. Use a stable test key.
  const testKey = `_smoke-test/probe-${Date.now()}.txt`;

  type Probe = { name: string; run: () => Promise<any> };
  const probes: Probe[] = [
    {
      name: 'GET  signed-url for existing read (proves admin-token + path work)',
      run: () => (bucket.generatePreSignedUrl as any)('grievance/', 'GET', { expiryIn: '300' }),
    },
    {
      name: 'GET  signed-url for new key (no object yet)',
      run: () => (bucket.generatePreSignedUrl as any)(testKey, 'GET', { expiryIn: '300' }),
    },
    {
      name: 'PUT  signed-url (the failing call from the prev test)',
      run: () => (bucket.generatePreSignedUrl as any)(testKey, 'PUT', { expiryIn: '300' }),
    },
    {
      name: 'listPagedObjects (admin GET, no body)',
      run: () => (bucket as any).listPagedObjects({ maxObjects: '3' }),
    },
    {
      name: 'headObject on an existing folder marker',
      run: () => (bucket as any).object('grievance/').headObject?.() ?? Promise.reject(new Error('no headObject method')),
    },
  ];

  DEBUG_LOG = true;
  for (const p of probes) {
    console.log('---', p.name);
    try {
      const r = await p.run();
      const out = JSON.stringify(r);
      console.log('  OK  ->', out.length > 300 ? out.slice(0, 300) + '...' : out);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isHtml = msg.includes('<!doctype html') || msg.includes('<html');
      console.log('  ERR HTTP', err?.statusCode, isHtml ? '(Tomcat HTML 400)' : '');
      if (!isHtml) console.log('     ', msg.slice(0, 300));
    }
    console.log();
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
