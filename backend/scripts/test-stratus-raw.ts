/**
 * Raw probe of Catalyst Stratus admin API on IN DC.
 *
 * Goal: figure out which header / method combination Tomcat actually
 * accepts on api.catalyst.zoho.in. Skips the SDK entirely so we can vary
 * one variable at a time.
 *
 * Run:  npx ts-node scripts/test-stratus-raw.ts
 */
import 'dotenv/config';

const ACCOUNTS = (process.env.X_ZOHO_CATALYST_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '');
const API = (process.env.X_ZOHO_CATALYST_CONSOLE_URL || 'https://api.catalyst.zoho.in').replace(/\/$/, '');
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
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json: any = await res.json();
  if (!json.access_token) throw new Error('No access_token: ' + JSON.stringify(json));
  return json.access_token;
}

async function probe(label: string, method: string, path: string, headers: Record<string, string>, body?: string) {
  const url = `${API}${path}`;
  const opt: any = { method, headers };
  if (body !== undefined) opt.body = body;
  let res: Response;
  try {
    res = await fetch(url, opt);
  } catch (err: any) {
    console.log(`  ${label}\n    NETWORK ERR: ${err?.message || err}`);
    return;
  }
  const text = await res.text().catch(() => '<unreadable>');
  const isHtml = /<!doctype html|<html/i.test(text);
  const ctype = res.headers.get('content-type') || '';
  console.log(`  ${label}`);
  console.log(`    -> HTTP ${res.status}  ct=${ctype}  ${isHtml ? '(Tomcat HTML)' : ''}`);
  if (!isHtml) console.log(`    body: ${text.slice(0, 300)}`);
}

async function main() {
  console.log('=== Raw probe of Catalyst Stratus admin API ===');
  console.log('  ACCOUNTS    =', ACCOUNTS);
  console.log('  API         =', API);
  console.log('  PROJECT_ID  =', PROJECT_ID);
  console.log('  BUCKET      =', BUCKET);
  console.log('  ENV         =', ENV);
  console.log();

  const token = await getAccessToken();
  console.log('OAuth token obtained, length =', token.length);
  console.log();

  const sigPath  = `/baas/v1/project/${PROJECT_ID}/bucket/signature?bucket_name=${BUCKET}`;
  const sigUrlPath = `/baas/v1/project/${PROJECT_ID}/bucket/object/signed-url?bucket_name=${BUCKET}&object_key=test.txt&expiry_in_seconds=300`;
  const listPath = `/baas/v1/project/${PROJECT_ID}/bucket/objects?bucket_name=${BUCKET}&folder_listing=false`;

  const baseAuth: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
  };

  const fullSdkLike: Record<string, string> = {
    ...baseAuth,
    PROJECT_ID,
    'X-Catalyst-Environment': ENV,
    Environment: ENV,
    'X-CATALYST-USER': 'admin',
    Accept: 'application/vnd.catalyst.v2+json',
    'User-Agent': 'zcatalyst-node/3.4.0',
  };

  console.log('--- Group A: list/get with full SDK headers');
  await probe('GET list (full SDK headers)', 'GET', listPath, fullSdkLike);
  await probe('GET signed-url (full SDK headers)', 'GET', sigUrlPath, fullSdkLike);
  console.log();

  console.log('--- Group B: drop the v2 Accept header');
  const noV2: Record<string, string> = { ...fullSdkLike };
  noV2.Accept = 'application/json';
  await probe('GET list  (Accept: application/json)', 'GET', listPath, noV2);
  await probe('GET signed-url (Accept: application/json)', 'GET', sigUrlPath, noV2);
  console.log();

  console.log('--- Group C: bare minimum headers');
  await probe('GET list  (only Authorization)', 'GET', listPath, baseAuth);
  await probe('GET signed-url (only Authorization)', 'GET', sigUrlPath, baseAuth);
  console.log();

  console.log('--- Group D: try v1 Accept');
  const v1: Record<string, string> = { ...fullSdkLike };
  v1.Accept = 'application/vnd.catalyst.v1+json';
  await probe('GET list  (Accept: v1+json)', 'GET', listPath, v1);
  console.log();

  console.log('--- Group E: try POST /bucket/signature with various bodies');
  await probe(
    'POST /bucket/signature  body={}',
    'POST',
    sigPath,
    { ...fullSdkLike, 'Content-Type': 'application/json' },
    '{}'
  );
  await probe(
    'POST /bucket/signature  no body, no Content-Type',
    'POST',
    sigPath,
    fullSdkLike
  );
  await probe(
    'POST /bucket/signature  body=full request',
    'POST',
    sigPath,
    { ...fullSdkLike, 'Content-Type': 'application/json' },
    JSON.stringify({
      bucket_name: BUCKET,
      operation: 'PUT',
      expiry_in_seconds: 300,
    })
  );
  console.log();

  console.log('--- Group F: try alternate path shapes');
  // older Catalyst pattern: /v1/project/<id>/...
  await probe('GET /v1/...  (no /baas)', 'GET', `/v1/project/${PROJECT_ID}/bucket/objects?bucket_name=${BUCKET}`, fullSdkLike);
  // newer pattern some docs reference
  await probe('GET /baas/v2/...', 'GET', `/baas/v2/project/${PROJECT_ID}/bucket/objects?bucket_name=${BUCKET}`, fullSdkLike);
  // stratus prefix
  await probe('GET /stratus/v1/...', 'GET', `/stratus/v1/project/${PROJECT_ID}/bucket/objects?bucket_name=${BUCKET}`, fullSdkLike);
  console.log();

  console.log('--- Group G: poke the bucket itself directly');
  const bucketHost = `https://${BUCKET}-development.zohostratus.in`;
  try {
    const res = await fetch(`${bucketHost}/`, { method: 'GET' });
    const t = await res.text();
    console.log(`  GET ${bucketHost}/  -> ${res.status}, body[0..200]: ${t.slice(0, 200)}`);
  } catch (e: any) {
    console.log('  bucket host err:', e?.message);
  }
  // unauthenticated PUT — proves the bucket exists and rejects the right way
  try {
    const res = await fetch(`${bucketHost}/_smoke-test/raw-${Date.now()}.txt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    const t = await res.text();
    console.log(`  PUT bucket (no auth) -> ${res.status}, body[0..200]: ${t.slice(0, 200)}`);
  } catch (e: any) {
    console.log('  bucket PUT err:', e?.message);
  }
  // PUT with Authorization
  try {
    const res = await fetch(`${bucketHost}/_smoke-test/raw-auth-${Date.now()}.txt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain', Authorization: `Zoho-oauthtoken ${token}` },
      body: 'hello',
    });
    const t = await res.text();
    console.log(`  PUT bucket (with token) -> ${res.status}, body[0..200]: ${t.slice(0, 200)}`);
  } catch (e: any) {
    console.log('  bucket PUT err:', e?.message);
  }
}

main().catch((err) => {
  console.error('Unhandled:', err);
  process.exit(1);
});
