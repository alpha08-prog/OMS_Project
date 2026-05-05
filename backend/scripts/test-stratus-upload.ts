/**
 * Tests the exact upload path the controller uses (lib/stratus → SDK
 * bucket.putObject). Apr 28/29 working code is now restored — this verifies
 * whether the failure is local code, or external (token / bucket / DC).
 *
 * Run from backend/:  npx ts-node scripts/test-stratus-upload.ts
 */
import 'dotenv/config';

import { uploadObject, getSignedDownloadUrl, buildObjectKey } from '../src/lib/stratus';

async function main() {
  console.log('=== Stratus uploadObject() smoke test ===\n');

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
  console.log('  api domain     =', process.env.CATALYST_API_DOMAIN || 'api.catalyst.zoho.in');
  console.log('  project_id     =', process.env.CATALYST_PROJECT_ID);
  console.log('  bucket         =', process.env.OMS_STRATUS_BUCKET ?? process.env.STRATUS_BUCKET ?? 'oms-attachments');
  console.log('  stratus suffix =', process.env.X_ZOHO_STRATUS_RESOURCE_SUFFIX || '(default .zohostratus.com)');
  console.log();

  // Fake the Express Request the wrapper expects. In local dev the wrapper
  // ignores `req` and uses cached refresh-token credentials.
  const fakeReq: any = {};

  const key = buildObjectKey('GRIEVANCE', 'smoke-test', `probe-${Date.now()}.txt`);
  const payload = Buffer.from('smoke test payload\n', 'utf-8');

  console.log(`[1/2] uploadObject(req, "${key}", <${payload.length} bytes>, "text/plain") ...`);
  try {
    await uploadObject(fakeReq, key, payload, 'text/plain');
    console.log('  PUT succeeded');
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isHtml = /<!doctype html|<html/i.test(msg);
    console.error('  FAILED');
    console.error('    statusCode:', err?.statusCode);
    console.error('    code:      ', err?.code);
    console.error('    message:   ', isHtml ? '(Tomcat HTML 400)' : msg.slice(0, 400));
    process.exit(1);
  }
  console.log();

  console.log('[2/2] getSignedDownloadUrl + GET to verify round-trip ...');
  let signed: string;
  try {
    signed = await getSignedDownloadUrl(fakeReq, key, 300);
    console.log('  signed URL acquired');
  } catch (err: any) {
    console.error('  signed URL FAILED:', err?.message || err);
    process.exit(1);
  }
  const getRes = await fetch(signed);
  const downloaded = Buffer.from(await getRes.arrayBuffer());
  console.log('  HTTP', getRes.status, ', bytes =', downloaded.length, ', match =', downloaded.equals(payload));
  console.log();

  console.log('=== PASS — uploadObject path works end-to-end ===');
  console.log(`(left object at key '${key}' for inspection in the Stratus console.)`);
}

main().catch((err) => {
  console.error('Unhandled:', err);
  process.exit(1);
});
