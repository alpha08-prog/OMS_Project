/**
 * Reverse bisect: start from the failing all-headers SDK shape, remove ONE
 * header at a time, find the offender.
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
  return ((await res.json()) as any).access_token;
}

function rawReq(headers: Record<string, string>): Promise<{ status: number; isHtml: boolean }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.catalyst.zoho.in',
        port: 443,
        path: `/baas/v1/project/${PROJECT_ID}/bucket/signature?bucket_name=${BUCKET}`,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode!, isHtml: /<!doctype|<html/i.test(body) });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const token = await getAccessToken();

  const FULL: Record<string, string> = {
    'User-Agent': 'zcatalyst-node/3.4.0',
    Authorization: `Zoho-oauthtoken ${token}`,
    PROJECT_ID,
    'X-Catalyst-Environment': ENV,
    Environment: ENV,
    'X-CATALYST-USER': 'admin',
    Accept: 'application/vnd.catalyst.v2+json',
  };

  console.log('Baseline: full SDK headers (mixed case)');
  let r = await rawReq(FULL);
  console.log(`  HTTP ${r.status} ${r.isHtml ? 'Tomcat HTML' : ''}`);
  console.log();

  // Remove one header at a time
  console.log('--- Remove ONE header from full set ---');
  for (const drop of Object.keys(FULL)) {
    if (drop === 'Authorization') continue; // can't drop auth
    const headers = { ...FULL };
    delete headers[drop];
    r = await rawReq(headers);
    console.log(`  drop "${drop}": HTTP ${r.status} ${r.isHtml ? 'Tomcat HTML' : '✓'}`);
  }
  console.log();

  // All-lowercase keys, all values
  const ALL_LOWER: Record<string, string> = {};
  for (const [k, v] of Object.entries(FULL)) {
    ALL_LOWER[k.toLowerCase()] = v;
  }
  console.log('--- Same headers but ALL keys lowercase ---');
  r = await rawReq(ALL_LOWER);
  console.log(`  HTTP ${r.status} ${r.isHtml ? 'Tomcat HTML' : '✓'}`);
  console.log();

  // Same SDK keys but force-add Connection: close (some servers care)
  console.log('--- Full SDK headers + Connection: close ---');
  r = await rawReq({ ...FULL, Connection: 'close' });
  console.log(`  HTTP ${r.status} ${r.isHtml ? 'Tomcat HTML' : '✓'}`);
  console.log();

  // Add Host explicitly (Node sets this, but maybe collision)
  console.log('--- Full SDK headers + explicit Host ---');
  r = await rawReq({ ...FULL, Host: 'api.catalyst.zoho.in' });
  console.log(`  HTTP ${r.status} ${r.isHtml ? 'Tomcat HTML' : '✓'}`);
  console.log();

  // Try Authorization with capital "B" instead of "Z"
  console.log('--- Full SDK headers but Authorization key is lowercase ---');
  const lowerAuth = { ...FULL };
  delete lowerAuth.Authorization;
  lowerAuth.authorization = `Zoho-oauthtoken ${token}`;
  r = await rawReq(lowerAuth);
  console.log(`  HTTP ${r.status} ${r.isHtml ? 'Tomcat HTML' : '✓'}`);
}

main().catch(console.error);
