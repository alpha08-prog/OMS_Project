/**
 * Reproduce the SDK's POST /bucket/signature using raw Node https.request
 * (the same primitive the SDK uses internally), with identical headers.
 *
 * If THIS fails but raw fetch (in test-stratus-raw.ts) succeeds, the
 * difference is somewhere in https.request's framing — Content-Length, body
 * write, Connection header, etc. — and we'll know to look there.
 */
import 'dotenv/config';
import https from 'https';

const PROJECT_ID = process.env.CATALYST_PROJECT_ID!;
const BUCKET = process.env.OMS_STRATUS_BUCKET || process.env.STRATUS_BUCKET || 'oms-attachments';
const ENV = process.env.CATALYST_ENVIRONMENT || 'Development';

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json: any = await res.json();
  return json.access_token;
}

function rawHttpsRequest(opts: https.RequestOptions, body?: string): Promise<{ status: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode!,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function main() {
  const token = await getAccessToken();

  const baseHeaders: Record<string, string> = {
    'User-Agent': 'zcatalyst-node/3.4.0',
    Authorization: `Zoho-oauthtoken ${token}`,
    PROJECT_ID,
    'X-Catalyst-Environment': ENV,
    Environment: ENV,
    'X-CATALYST-USER': 'admin',
    Accept: 'application/vnd.catalyst.v2+json',
  };

  type Probe = {
    label: string;
    method: string;
    extraHeaders?: Record<string, string>;
    body?: string;
  };

  const path = `/baas/v1/project/${PROJECT_ID}/bucket/signature?bucket_name=${BUCKET}`;
  const probes: Probe[] = [
    {
      label: 'A: raw POST, no body (mimics SDK)',
      method: 'POST',
    },
    {
      label: 'B: raw POST, Content-Length: 0 explicit',
      method: 'POST',
      extraHeaders: { 'Content-Length': '0' },
    },
    {
      label: 'C: raw POST, body={}',
      method: 'POST',
      body: '{}',
      extraHeaders: { 'Content-Type': 'application/json' },
    },
    {
      label: 'D: raw POST, body={} but no Content-Type',
      method: 'POST',
      body: '{}',
    },
    {
      label: 'E: SDK shape + accept-encoding (what fetch sends)',
      method: 'POST',
      extraHeaders: { 'accept-encoding': 'br, gzip, deflate' },
    },
    {
      label: 'F: SDK shape + Connection: close',
      method: 'POST',
      extraHeaders: { Connection: 'close' },
    },
    {
      label: 'G: minimal — only Authorization (mimics fetch Group C)',
      method: 'POST',
      // empty extraHeaders, override base by replacing
    },
  ];

  // Special case for G: build with only Authorization
  const minimalProbe: Probe = probes.find((p) => p.label.startsWith('G:'))!;
  (minimalProbe as any).overrideHeaders = {
    Authorization: `Zoho-oauthtoken ${token}`,
  };

  for (const p of probes) {
    const headers = (p as any).overrideHeaders
      ? { ...(p as any).overrideHeaders }
      : { ...baseHeaders, ...(p.extraHeaders || {}) };
    if (p.body !== undefined) {
      // Node's https.request sets Content-Length automatically when we
      // call req.write — but only if Content-Length isn't already set.
      // Mimic the SDK: it doesn't set Content-Length when there's no body,
      // but does when there is.
      if (!headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = String(Buffer.byteLength(p.body));
      }
    }

    const opts: https.RequestOptions = {
      method: p.method,
      hostname: 'api.catalyst.zoho.in',
      port: 443,
      path,
      headers,
    };

    console.log('---', p.label);
    console.log('  headers:', { ...headers, Authorization: '<redacted>' });
    try {
      const res = await rawHttpsRequest(opts, p.body);
      const isHtml = /<!doctype html|<html/i.test(res.body);
      console.log(`  -> HTTP ${res.status}, ct=${res.headers['content-type'] || ''} ${isHtml ? '(Tomcat HTML)' : ''}`);
      if (!isHtml) console.log(`     body[0..240]: ${res.body.slice(0, 240)}`);
    } catch (err: any) {
      console.log('  ERR:', err?.message);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
