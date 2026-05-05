/** Bare-bones fetch — NO imports beyond dotenv. */
import 'dotenv/config';

const PROJECT_ID = process.env.CATALYST_PROJECT_ID!;
const BUCKET = process.env.OMS_STRATUS_BUCKET || 'oms-attachments';
const ENV = process.env.CATALYST_ENVIRONMENT || 'Development';

(async () => {
  const fs = await import('fs'), os = await import('os'), path = await import('path');
  const cache = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'oms-zoho-access-token.json'), 'utf-8'));
  const token: string = cache.value;

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
  console.log(`HTTP ${res.status} ${isHtml ? 'Tomcat HTML' : '✓'}`);
  if (!isHtml) console.log(text.slice(0, 240));
})().catch(console.error);
