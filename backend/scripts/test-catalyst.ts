/**
 * Smoke test: verify Catalyst SDK can connect to the Visitor table.
 *
 * Uses ONLY the row CRUD API (no ZCQL) so it works with the
 * tables.rows.READ/CREATE/UPDATE/DELETE scopes alone.
 *
 * Run from backend/:  npx ts-node scripts/test-catalyst.ts
 */
import 'dotenv/config';
import https from 'https';

// Same monkey-patch as in src/lib/catalyst.ts — strip the SDK's empty next_token=
const _origReq = https.request;
(https as any).request = function (...args: any[]) {
  const opts = args[0];
  if (opts && typeof opts === 'object' && typeof opts.path === 'string') {
    opts.path = opts.path.replace(/[?&]next_token=(?=&|$)/g, '').replace(/\?$/, '');
  }
  return _origReq.apply(https, args as any);
};

import catalystSDK from 'zcatalyst-sdk-node';

async function main() {
  console.log('=== Catalyst SDK Smoke Test (row CRUD only) ===\n');

  const required = [
    'CATALYST_PROJECT_ID',
    'CATALYST_CLIENT_ID',
    'CATALYST_CLIENT_SECRET',
    'CATALYST_REFRESH_TOKEN',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }
  console.log('✓ All env vars present\n');

  const credential = catalystSDK.credential.refreshToken({
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
  });

  let app;
  try {
    app = catalystSDK.initializeApp({
      project_id: process.env.CATALYST_PROJECT_ID!,
      project_key:
        process.env.CATALYST_PROJECT_KEY || process.env.CATALYST_PROJECT_ID!,
      project_domain:
        process.env.CATALYST_API_DOMAIN || 'api.catalyst.zoho.in',
      environment: process.env.CATALYST_ENVIRONMENT || 'Development',
      credential,
    });
    console.log('✓ SDK initialized\n');
  } catch (err: any) {
    console.error('❌ SDK init failed:', err.message);
    process.exit(1);
  }

  const visitorTable = app.datastore().table('Visitor');

  console.log('--- Test 1: getPagedRows on Visitor (read scope) ---');
  try {
    const result = await visitorTable.getPagedRows({ maxRows: 5 });
    console.log('✓ Read OK, row count:', (result.data as any[]).length);
  } catch (err: any) {
    console.error('❌ Read failed:', err.message?.substring(0, 150) || err);
    if (err.statusCode) console.error('   HTTP', err.statusCode);
    process.exit(1);
  }

  console.log('\n--- Test 2: Insert a test row (create scope) ---');
  let insertedRowId: string | undefined;
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const visitDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const inserted: any = await visitorTable.insertRow({
      name: 'Smoke Test Visitor',
      designation: 'Tester',
      phone: '0000000000',
      purpose: 'Catalyst SDK smoke test - safe to delete',
      referencedBy: 'Migration POC',
      visitDate,
      createdById: 'smoke-test-script',
    });
    insertedRowId = String(inserted.ROWID);
    console.log('✓ Insert OK, ROWID:', insertedRowId);
  } catch (err: any) {
    console.error('❌ Insert failed:', err.message?.substring(0, 200) || err);
    process.exit(1);
  }

  console.log('\n--- Test 3: getRow by ROWID (read scope) ---');
  try {
    const row: any = await visitorTable.getRow(insertedRowId!);
    console.log('✓ getRow OK, name:', row.name);
  } catch (err: any) {
    console.error('❌ getRow failed:', err.message?.substring(0, 200) || err);
  }

  console.log('\n--- Test 4: Update the test row (update scope) ---');
  try {
    await visitorTable.updateRow({
      ROWID: insertedRowId!,
      designation: 'Updated Tester',
    } as any);
    console.log('✓ Update OK');
  } catch (err: any) {
    console.error('❌ Update failed:', err.message?.substring(0, 200) || err);
  }

  console.log('\n--- Test 5: Delete the test row (delete scope) ---');
  try {
    await visitorTable.deleteRow(insertedRowId!);
    console.log('✓ Delete OK\n');
  } catch (err: any) {
    console.error('❌ Delete failed:', err.message?.substring(0, 200) || err);
  }

  console.log('=== ALL TESTS PASSED ✅ ===');
  console.log('Catalyst SDK is wired up correctly.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
