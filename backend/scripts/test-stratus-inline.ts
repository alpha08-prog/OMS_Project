/**
 * Inline what stratus.ts uploadObject does — but without importing stratus.ts.
 * If THIS works while test-stratus-upload.ts (which imports stratus.ts) fails,
 * the import itself is the cause.
 */
import 'dotenv/config';

const PROJECT_ID = process.env.CATALYST_PROJECT_ID!;
const BUCKET = process.env.OMS_STRATUS_BUCKET || 'oms-attachments';
const ENV = process.env.CATALYST_ENVIRONMENT || 'Development';

async function main() {
  // 1. fresh OAuth refresh
  const tokenParams = new URLSearchParams({
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  });
  const tokRes = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });
  const tok: any = await tokRes.json();
  const token: string = tok.access_token;
  if (!token) throw new Error('no token: ' + JSON.stringify(tok));
  console.log('Got token (length', token.length + ')');

  // 2a. Hot-up the connection: GET list with bare auth (proven to work in Group C)
  const listUrl = `https://api.catalyst.zoho.in/baas/v1/project/${PROJECT_ID}/bucket/objects?bucket_name=${BUCKET}&folder_listing=false`;
  const listRes = await fetch(listUrl, {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  console.log('warmup GET list:', listRes.status, (await listRes.text()).slice(0, 80));

  // 2. POST /bucket/signature
  const sigUrl = `https://api.catalyst.zoho.in/baas/v1/project/${PROJECT_ID}/bucket/signature?bucket_name=${BUCKET}`;
  const sigHeaders: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    PROJECT_ID,
    'X-Catalyst-Environment': ENV,
    Environment: ENV,
    'X-CATALYST-USER': 'admin',
    Accept: 'application/vnd.catalyst.v2+json',
    'User-Agent': 'zcatalyst-node/3.4.0',
  };
  const sigRes = await fetch(sigUrl, { method: 'POST', headers: sigHeaders });
  const sigText = await sigRes.text();
  console.log('signature:', sigRes.status, sigText.slice(0, 200));
  if (!sigRes.ok) throw new Error('signature failed');

  const sigJson = JSON.parse(sigText);
  const qs: string = sigJson.data.signature;
  console.log('qs[0..200]:', qs.slice(0, 200));

  // 3. PUT to bucket URL
  const key = `_smoke-test/inline-${Date.now()}.txt`;
  const payload = Buffer.from('inline smoke test\n', 'utf-8');
  const putUrl = `https://${BUCKET}-development.zohostratus.in/_signed/${encodeURI(key)}?${qs}`;
  console.log('PUT', putUrl.slice(0, 200), '...');
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: payload as any,
  });
  const putText = await putRes.text();
  console.log('put result:', putRes.status, putText.slice(0, 200));

  // 4. Try ANOTHER POST without re-warming — does the warmup persist?
  console.log('---');
  console.log('Probing whether warmup persists across more calls...');
  for (let i = 0; i < 3; i++) {
    const r = await fetch(sigUrl, { method: 'POST', headers: sigHeaders });
    console.log(`  iter ${i + 1}: HTTP ${r.status}`);
    await r.text();
  }
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
