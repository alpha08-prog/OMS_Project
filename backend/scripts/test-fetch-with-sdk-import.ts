/**
 * Minimal repro: top-level import of zcatalyst-sdk-node + a single fetch
 * to /bucket/signature. If this returns Tomcat 400 while a script WITHOUT
 * the SDK import returns 200, the SDK's module-level init is the cause.
 */
import 'dotenv/config';

// Top-level SDK import — DOES NOT USE the SDK, just loads its module
// (which is what stratus.ts → catalyst.ts effectively does).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _catalystSDK from 'zcatalyst-sdk-node';

const PROJECT_ID = process.env.CATALYST_PROJECT_ID!;
const BUCKET = process.env.OMS_STRATUS_BUCKET || 'oms-attachments';
const ENV = process.env.CATALYST_ENVIRONMENT || 'Development';

async function main() {
  // Reuse the disk-cached token from stratus.ts so we don't trip OAuth rate limit
  let token: string;
  try {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const cache = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'oms-zoho-access-token.json'), 'utf-8'));
    if (cache.expiresAt > Date.now() + 60_000) {
      token = cache.value;
      console.log('Using cached access token, expires in', Math.round((cache.expiresAt - Date.now()) / 1000), 's');
    } else {
      throw new Error('Cached token expired');
    }
  } catch (err: any) {
    console.error('No usable cached token:', err.message);
    process.exit(1);
  }

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    PROJECT_ID,
    'X-Catalyst-Environment': ENV,
    Environment: ENV,
    'X-CATALYST-USER': 'admin',
    Accept: 'application/vnd.catalyst.v2+json',
    'User-Agent': 'zcatalyst-node/3.4.0',
  };
  const url = `https://api.catalyst.zoho.in/baas/v1/project/${PROJECT_ID}/bucket/signature?bucket_name=${BUCKET}`;

  console.log('POST', url);
  const res = await fetch(url, { method: 'POST', headers });
  const text = await res.text();
  const isHtml = /<!doctype|<html/i.test(text);
  console.log(`-> HTTP ${res.status} ${isHtml ? 'Tomcat HTML' : '✓'}`);
  if (!isHtml) console.log('   body:', text.slice(0, 240));
}

main().catch(console.error);
