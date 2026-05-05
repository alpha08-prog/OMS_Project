/**
 * Hypothesis: importing zcatalyst-sdk-node at module load does something
 * that breaks Node's fetch (or its TLS layer) for certain Catalyst hosts.
 *
 * Step 1 — fetch BEFORE SDK is imported.
 * Step 2 — import the SDK (just to load its module).
 * Step 3 — fetch AFTER SDK is imported.
 *
 * If step 3 returns Tomcat 400 while step 1 returned 200, the SDK is the cause.
 */
import 'dotenv/config';

const PROJECT_ID = process.env.CATALYST_PROJECT_ID!;
const BUCKET = process.env.OMS_STRATUS_BUCKET || 'oms-attachments';
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

async function probe(label: string) {
  const token = await getAccessToken();
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
  const res = await fetch(url, { method: 'POST', headers });
  const text = await res.text();
  const isHtml = /<!doctype|<html/i.test(text);
  console.log(`${label}: HTTP ${res.status} ${isHtml ? 'Tomcat HTML' : '✓'}`);
}

(async () => {
  await probe('BEFORE SDK import');
  // Now import SDK and try again
  await import('zcatalyst-sdk-node');
  await probe('AFTER  SDK import');
})().catch(console.error);
