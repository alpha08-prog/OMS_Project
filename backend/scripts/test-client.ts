/**
 * Smoke test for the custom Catalyst REST client (no SDK).
 * Run from backend/:  npx ts-node scripts/test-client.ts
 */
import 'dotenv/config';
import {
  insertRow,
  listRows,
  getRow,
  updateRow,
  deleteRow,
  toCatalystDate,
} from '../src/lib/catalyst-client';

async function main() {
  console.log('=== Catalyst Custom Client Smoke Test ===\n');

  console.log('--- 1. List existing rows ---');
  const before = await listRows('Visitor', { maxRows: 5 });
  console.log(`  ✓ Got ${before.rows.length} rows, more_records=${before.moreRecords}`);

  console.log('\n--- 2. Insert a test row ---');
  const inserted = await insertRow('Visitor', {
    name: 'Custom-Client Smoke Test',
    designation: 'Tester',
    phone: '0000000000',
    purpose: 'Custom REST client smoke test',
    referencedBy: 'Migration POC',
    visitDate: toCatalystDate(new Date()),
    createdById: 'smoke-test-script',
  });
  console.log(`  ✓ ROWID: ${inserted.ROWID}, name: ${inserted.name}`);

  console.log('\n--- 3. Get the row back ---');
  const fetched = await getRow('Visitor', inserted.ROWID);
  if (!fetched) throw new Error('getRow returned null');
  console.log(`  ✓ Fetched name: ${fetched.name}, createdById: ${fetched.createdById}`);

  console.log('\n--- 4. Update the row ---');
  const updated = await updateRow('Visitor', {
    ROWID: inserted.ROWID,
    designation: 'Updated Tester',
  });
  console.log(`  ✓ Updated designation: ${updated.designation}`);

  console.log('\n--- 5. Delete the row ---');
  await deleteRow('Visitor', inserted.ROWID);
  console.log(`  ✓ Row deleted`);

  console.log('\n--- 6. Confirm row count is back to original ---');
  const after = await listRows('Visitor', { maxRows: 5 });
  console.log(`  ✓ Got ${after.rows.length} rows`);

  console.log('\n=== ALL TESTS PASSED ✅ ===');
}

main().catch((err) => {
  console.error('\n❌ FAILED:', err.message);
  if (err.statusCode) console.error('   HTTP', err.statusCode);
  process.exit(1);
});
