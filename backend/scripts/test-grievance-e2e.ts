/**
 * End-to-end test of the Grievance module with USE_CATALYST_GRIEVANCE=true.
 *
 * Verifies:
 *   - STAFF creates a grievance (lands in Catalyst with default status/stage/flags)
 *   - STAFF data isolation works
 *   - ADMIN sees all grievances
 *   - Cross-user read → 403
 *   - Verification queue (FIFO, only OPEN + unverified)
 *   - PATCH /verify flow (sets status=RESOLVED, isVerified, verifiedBy/At)
 *   - PATCH /status flow
 *   - PUT update
 *   - DELETE
 *
 * Run from backend/:
 *   1. USE_CATALYST_GRIEVANCE=true in .env
 *   2. Start server:  npm run dev
 *   3. Run test:      npx ts-node scripts/test-grievance-e2e.ts
 */
import 'dotenv/config';
import { generateToken } from '../src/utils/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000';

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
  console.log('=== Grievance E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_GRIEVANCE: ${process.env.USE_CATALYST_GRIEVANCE}\n`);

  console.log('--- Step 1: Server health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok, `HTTP ${res.status}`);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  console.log('\n--- Step 2: STAFF creates a grievance ---');
  const create = await call('POST', '/api/grievances', staffToken, {
    petitionerName: `E2E Petitioner ${Date.now()}`,
    mobileNumber: '9876543210',
    constituency: 'Test Constituency',
    grievanceType: 'WATER',
    description: 'E2E test grievance — supply disruption in test area.',
    monetaryValue: 1500.5,
    actionRequired: 'FORWARD_TO_DEPT',
    referencedBy: 'E2E Migration Test',
  });
  check('Create returns 201', create.status === 201, `got ${create.status}, body: ${JSON.stringify(create.body).substring(0, 200)}`);
  check(
    'Has Catalyst-style ROWID (numeric string)',
    typeof create.body?.data?.id === 'string' && /^\d+$/.test(create.body.data.id),
    `id: ${create.body?.data?.id}`
  );
  check('Default status = OPEN', create.body?.data?.status === 'OPEN');
  check('Default isVerified = false', create.body?.data?.isVerified === false);
  check('Default isLocked = false', create.body?.data?.isLocked === false);
  check('Default currentStage = RECEIVED', create.body?.data?.currentStage === 'RECEIVED');
  check('createdById = STAFF', create.body?.data?.createdById === STAFF.id);
  check('monetaryValue stored as number', typeof create.body?.data?.monetaryValue === 'number');

  const grievanceId = create.body?.data?.id;
  if (!grievanceId) {
    console.error('\nCannot continue without a grievance ID');
    process.exit(1);
  }

  console.log('\n--- Step 3: STAFF list — data isolation ---');
  const staffList = await call('GET', '/api/grievances', staffToken);
  check('List returns 200', staffList.status === 200);
  const staffRows = staffList.body?.data ?? [];
  check(
    'STAFF only sees own grievances',
    staffRows.every((g: any) => g.createdById === STAFF.id),
    `unique createdBys: ${[...new Set(staffRows.map((g: any) => g.createdById))].join(',')}`
  );
  check('STAFF sees the just-created grievance', staffRows.some((g: any) => g.id === grievanceId));

  console.log('\n--- Step 4: ADMIN list — sees all ---');
  const adminList = await call('GET', '/api/grievances', adminToken);
  check('Admin list 200', adminList.status === 200);
  check(
    'ADMIN sees the STAFF grievance',
    (adminList.body?.data ?? []).some((g: any) => g.id === grievanceId)
  );

  console.log('\n--- Step 5: Verification queue (FIFO, OPEN + unverified) ---');
  const queue = await call('GET', '/api/grievances/queue/verification', adminToken);
  check('Queue returns 200', queue.status === 200);
  const queueRows = queue.body?.data ?? [];
  check(
    'Queue contains the new grievance',
    queueRows.some((g: any) => g.id === grievanceId)
  );
  check(
    'All queue items have status=OPEN',
    queueRows.every((g: any) => g.status === 'OPEN')
  );
  check(
    'All queue items are unverified',
    queueRows.every((g: any) => g.isVerified === false)
  );

  console.log('\n--- Step 6: STAFF tries to read someone else\'s grievance → 403 ---');
  const otherGrievance = (adminList.body?.data ?? []).find(
    (g: any) => g.createdById && g.createdById !== STAFF.id
  );
  if (otherGrievance) {
    const r = await call('GET', `/api/grievances/${otherGrievance.id}`, staffToken);
    check('STAFF reading another\'s grievance → 403', r.status === 403, `got ${r.status}`);
  } else {
    console.log('  (skipped — no grievance by another user)');
  }

  console.log('\n--- Step 7: STAFF updates description ---');
  const upd = await call('PUT', `/api/grievances/${grievanceId}`, staffToken, {
    description: 'Updated by E2E test',
    monetaryValue: 2000,
  });
  check('Update 200', upd.status === 200);
  check('Description updated', upd.body?.data?.description === 'Updated by E2E test');
  check('monetaryValue updated', upd.body?.data?.monetaryValue === 2000);

  console.log('\n--- Step 8: ADMIN changes status → IN_PROGRESS ---');
  const stat = await call('PATCH', `/api/grievances/${grievanceId}/status`, adminToken, {
    status: 'IN_PROGRESS',
  });
  check('Status update 200', stat.status === 200);
  check('Status now IN_PROGRESS', stat.body?.data?.status === 'IN_PROGRESS');

  console.log('\n--- Step 9: ADMIN verifies (status → RESOLVED) ---');
  // First reset status to OPEN so verify path is realistic
  await call('PATCH', `/api/grievances/${grievanceId}/status`, adminToken, { status: 'OPEN' });
  const ver = await call('PATCH', `/api/grievances/${grievanceId}/verify`, adminToken);
  check('Verify 200', ver.status === 200);
  check('isVerified = true', ver.body?.data?.isVerified === true);
  check('Status = RESOLVED', ver.body?.data?.status === 'RESOLVED');
  check('verifiedById = ADMIN', ver.body?.data?.verifiedById === ADMIN.id);
  check('verifiedAt is set', Boolean(ver.body?.data?.verifiedAt));
  check('resolvedAt is set', Boolean(ver.body?.data?.resolvedAt));

  console.log('\n--- Step 10: STAFF tries to verify (forbidden) ---');
  const forbidVerify = await call(
    'PATCH',
    `/api/grievances/${grievanceId}/verify`,
    staffToken
  );
  check('STAFF verify → 403', forbidVerify.status === 403, `got ${forbidVerify.status}`);

  console.log('\n--- Step 11: ADMIN deletes (cleanup) ---');
  const del = await call('DELETE', `/api/grievances/${grievanceId}`, adminToken);
  check('Delete 200', del.status === 200);

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
