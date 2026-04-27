/**
 * End-to-end test of the Visitor module with USE_CATALYST_VISITOR=true.
 *
 * Verifies:
 *   - Server is up
 *   - STAFF user can create a visitor (lands in Catalyst)
 *   - STAFF sees only their own visitors (data isolation)
 *   - ADMIN sees all visitors
 *   - Cross-user access (STAFF reading another STAFF's visitor) → 403
 *   - DELETE works
 *
 * Uses existing seeded users from the Prisma User table.
 *
 * Run from backend/:
 *   1. Make sure USE_CATALYST_VISITOR=true in .env
 *   2. Start server in another terminal:  npm run dev
 *   3. In this terminal:                  npx ts-node scripts/test-e2e.ts
 */
import 'dotenv/config';
import { generateToken } from '../src/utils/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000';

// Real users from Prisma User table
const STAFF = {
  id: 'cc4afe35-c39a-4026-b925-d0b0e7386cfb',
  email: 'staff@oms.gov.in',
  role: 'STAFF' as const,
  name: 'Data Entry Staff',
};

const ADMIN = {
  id: '8031293b-84a6-48e4-9f41-f11210db61cb',
  email: 'admin@oms.gov.in',
  role: 'ADMIN' as const,
  name: 'Office Administrator',
};

const staffToken = generateToken(STAFF);
const adminToken = generateToken(ADMIN);

async function call(
  method: string,
  path: string,
  token: string,
  body?: any
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, body: data };
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

async function main() {
  console.log('=== Visitor E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_VISITOR: ${process.env.USE_CATALYST_VISITOR}\n`);

  console.log('--- Step 1: Server health check ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok, `HTTP ${res.status}`);
  } catch (err: any) {
    check('Server is up', false, err.message);
    console.error('\n❌ Dev server isn\'t running. Start it with: npm run dev');
    process.exit(1);
  }

  console.log('\n--- Step 2: STAFF creates a visitor (should hit Catalyst) ---');
  const create = await call('POST', '/api/visitors', staffToken, {
    name: `E2E Test ${Date.now()}`,
    designation: 'Public',
    phone: '9876543210',
    purpose: 'E2E Catalyst smoke test',
    referencedBy: 'Migration POC',
    visitDate: new Date().toISOString(),
  });
  check('Create returns 201', create.status === 201, `got ${create.status}, body: ${JSON.stringify(create.body).substring(0, 200)}`);
  check(
    'Visitor has Catalyst-style ROWID (numeric string)',
    typeof create.body?.data?.id === 'string' && /^\d+$/.test(create.body.data.id),
    `id: ${create.body?.data?.id}`
  );
  check(
    'createdById matches STAFF user',
    create.body?.data?.createdById === STAFF.id,
    `got: ${create.body?.data?.createdById}`
  );

  const visitorId = create.body?.data?.id;
  if (!visitorId) {
    console.error('\nCannot continue without a visitor ID.');
    process.exit(1);
  }

  console.log('\n--- Step 3: STAFF lists visitors (data isolation) ---');
  const staffList = await call('GET', '/api/visitors', staffToken);
  check('List returns 200', staffList.status === 200);
  const staffVisitors = staffList.body?.data ?? [];
  check(
    'STAFF sees only their own visitors',
    staffVisitors.every((v: any) => v.createdById === STAFF.id),
    `Found ${staffVisitors.length} visitors, createdBy values: ${[...new Set(staffVisitors.map((v: any) => v.createdById))].join(', ')}`
  );
  check(
    'STAFF sees the visitor they just created',
    staffVisitors.some((v: any) => v.id === visitorId),
    `Looking for ${visitorId} in ${staffVisitors.length} rows`
  );

  console.log('\n--- Step 4: ADMIN lists visitors (sees everything) ---');
  const adminList = await call('GET', '/api/visitors', adminToken);
  check('Admin list returns 200', adminList.status === 200);
  const adminVisitors = adminList.body?.data ?? [];
  check(
    'ADMIN sees the STAFF\'s visitor',
    adminVisitors.some((v: any) => v.id === visitorId),
    `${adminVisitors.length} visitors total`
  );

  console.log('\n--- Step 5: STAFF tries to read another STAFF\'s visitor → forbidden? ---');
  // The visitor we just created belongs to staff. We need to fake one belonging to admin.
  // Skip this test if no other-creator visitor exists.
  const otherVisitor = adminVisitors.find((v: any) => v.createdById !== STAFF.id);
  if (otherVisitor) {
    const readOther = await call('GET', `/api/visitors/${otherVisitor.id}`, staffToken);
    check('STAFF reading another\'s visitor → 403', readOther.status === 403, `got ${readOther.status}`);
  } else {
    console.log('  (skipped — no visitor by other creator to test against)');
  }

  console.log('\n--- Step 6: STAFF updates their own visitor ---');
  const update = await call('PUT', `/api/visitors/${visitorId}`, staffToken, {
    designation: 'Updated by E2E',
  });
  check('Update returns 200', update.status === 200);
  check('Update applied', update.body?.data?.designation === 'Updated by E2E');

  console.log('\n--- Step 7: ADMIN deletes the test visitor (cleanup) ---');
  const del = await call('DELETE', `/api/visitors/${visitorId}`, adminToken);
  check('Delete returns 200', del.status === 200, `got ${del.status}`);

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
