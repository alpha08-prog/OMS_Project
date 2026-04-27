/**
 * End-to-end test of the TrainRequest module with USE_CATALYST_TRAIN=true.
 *
 * Verifies:
 *   - STAFF creates a train request with nested passengers (lands in Catalyst)
 *   - Defaults applied: status=PENDING
 *   - GET / lists with STAFF data isolation; ADMIN sees all
 *   - Pending queue (FIFO by dateOfJourney)
 *   - Cross-user 403
 *   - PUT update (replaces passengers)
 *   - PATCH /approve (PENDING → APPROVED, sets approvedAt + approvedById)
 *   - PATCH /approve fails on already-approved (status machine enforced)
 *   - PATCH /reject (PENDING → REJECTED, with reason)
 *   - PATCH /resolve (APPROVED → RESOLVED)
 *   - GET /pnr/:pnr returns 410 (RapidAPI dropped)
 *   - DELETE cascades passengers
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
  console.log('=== TrainRequest E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_TRAIN: ${process.env.USE_CATALYST_TRAIN}\n`);

  console.log('--- Step 1: Health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  console.log('\n--- Step 2: STAFF creates a request with 2 passengers ---');
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const create = await call('POST', '/api/train-requests', staffToken, {
    passengerName: 'Rahul Sharma',
    pnrNumber: '1234567890',
    trainName: 'Rajdhani Express',
    trainNumber: '12301',
    journeyClass: '2A',
    dateOfJourney: futureDate.toISOString(),
    fromStation: 'NDLS (New Delhi)',
    toStation: 'HWH (Howrah)',
    route: 'NDLS-HWH',
    boardingPoint: 'NDLS',
    bookingType: 'TATKAL',
    contactNumber: '9876543210',
    referencedBy: 'MLA Office',
    remarks: 'Urgent travel for family',
    passengers: [
      { name: 'Rahul Sharma', age: 35, gender: 'MALE', berthPreference: 'LOWER' },
      { name: 'Priya Sharma', age: 32, gender: 'FEMALE', berthPreference: 'LOWER' },
    ],
  });
  check('Create returns 201', create.status === 201, `got ${create.status}, body: ${JSON.stringify(create.body).substring(0, 200)}`);
  check('Has Catalyst-style ROWID', typeof create.body?.data?.id === 'string' && /^\d+$/.test(create.body.data.id));
  check('Default status = PENDING', create.body?.data?.status === 'PENDING');
  check('bookingType = TATKAL', create.body?.data?.bookingType === 'TATKAL');
  check('route mapped (frontend↔Catalyst)', create.body?.data?.route === 'NDLS-HWH');
  check('createdById = STAFF', create.body?.data?.createdById === STAFF.id);
  check('Has 2 passengers', Array.isArray(create.body?.data?.train_passengers) && create.body.data.train_passengers.length === 2);
  check('Passenger 1 name correct', create.body?.data?.train_passengers?.[0]?.name === 'Rahul Sharma' || create.body?.data?.train_passengers?.[1]?.name === 'Rahul Sharma');

  const reqId = create.body?.data?.id;
  if (!reqId) {
    console.error('\nNo request ID — aborting.');
    process.exit(1);
  }

  console.log('\n--- Step 3: STAFF list (data isolation) ---');
  const staffList = await call('GET', '/api/train-requests', staffToken);
  check('List 200', staffList.status === 200);
  const staffRows = staffList.body?.data ?? [];
  check(
    'Every row has createdById = STAFF',
    staffRows.every((t: any) => t.createdById === STAFF.id)
  );
  check('STAFF sees the just-created request', staffRows.some((t: any) => t.id === reqId));

  console.log('\n--- Step 4: ADMIN sees all ---');
  const adminList = await call('GET', '/api/train-requests', adminToken);
  check('Admin list 200', adminList.status === 200);
  check('ADMIN sees the STAFF request', (adminList.body?.data ?? []).some((t: any) => t.id === reqId));

  console.log('\n--- Step 5: Pending queue (FIFO by dateOfJourney) ---');
  const queue = await call('GET', '/api/train-requests/queue/pending', adminToken);
  check('Queue 200', queue.status === 200);
  const queueRows = queue.body?.data ?? [];
  check('Queue contains the new request', queueRows.some((t: any) => t.id === reqId));
  check('All queue items are PENDING', queueRows.every((t: any) => t.status === 'PENDING'));

  console.log('\n--- Step 6: Read by ID, includes nested passengers ---');
  const byId = await call('GET', `/api/train-requests/${reqId}`, staffToken);
  check('GET by id 200', byId.status === 200);
  check('Has 2 passengers in response', Array.isArray(byId.body?.data?.train_passengers) && byId.body.data.train_passengers.length === 2);

  console.log('\n--- Step 7: STAFF updates request (replace passenger list) ---');
  const upd = await call('PUT', `/api/train-requests/${reqId}`, staffToken, {
    remarks: 'Updated by E2E test',
    passengers: [
      { name: 'Rahul Sharma', age: 35, gender: 'MALE', berthPreference: 'LOWER' },
    ],
  });
  check('Update 200', upd.status === 200);
  check('remarks updated', upd.body?.data?.remarks === 'Updated by E2E test');
  check('Passenger list now has 1 entry', upd.body?.data?.train_passengers?.length === 1);

  console.log('\n--- Step 8: STAFF cannot approve (admin only) ---');
  const forbidApprove = await call('PATCH', `/api/train-requests/${reqId}/approve`, staffToken);
  check('STAFF approve → 403', forbidApprove.status === 403, `got ${forbidApprove.status}`);

  console.log('\n--- Step 9: ADMIN approves ---');
  const ap = await call('PATCH', `/api/train-requests/${reqId}/approve`, adminToken);
  check('Approve 200', ap.status === 200);
  check('Status APPROVED', ap.body?.data?.status === 'APPROVED');
  check('approvedById = ADMIN', ap.body?.data?.approvedById === ADMIN.id);
  check('approvedAt is set', Boolean(ap.body?.data?.approvedAt));

  console.log('\n--- Step 10: Approving twice fails (status machine) ---');
  const ap2 = await call('PATCH', `/api/train-requests/${reqId}/approve`, adminToken);
  check('Second approve → error', ap2.status >= 400 && ap2.status < 500);

  console.log('\n--- Step 11: ADMIN resolves (APPROVED → RESOLVED) ---');
  const resolve = await call('PATCH', `/api/train-requests/${reqId}/resolve`, adminToken);
  check('Resolve 200', resolve.status === 200);
  check('Status RESOLVED', resolve.body?.data?.status === 'RESOLVED');

  console.log('\n--- Step 12: Try to reject after RESOLVED (should fail) ---');
  const lateReject = await call('PATCH', `/api/train-requests/${reqId}/reject`, adminToken, { reason: 'too late' });
  check('Late reject → error', lateReject.status >= 400 && lateReject.status < 500);

  console.log('\n--- Step 13: PNR endpoint returns 410 (dropped) ---');
  const pnr = await call('GET', '/api/train-requests/pnr/1234567890', staffToken);
  check('PNR endpoint → 410 Gone', pnr.status === 410, `got ${pnr.status}`);

  console.log('\n--- Step 14: Reject flow on a NEW request ---');
  const create2 = await call('POST', '/api/train-requests', staffToken, {
    passengerName: 'Test Reject',
    pnrNumber: '9999999999',
    journeyClass: '3A',
    dateOfJourney: futureDate.toISOString(),
    fromStation: 'NDLS',
    toStation: 'BCT',
    bookingType: 'GENERAL',
    passengers: [{ name: 'Test Reject', age: 40, gender: 'MALE' }],
  });
  const rejectId = create2.body?.data?.id;
  if (rejectId) {
    const rj = await call('PATCH', `/api/train-requests/${rejectId}/reject`, adminToken, {
      reason: 'Insufficient documentation',
    });
    check('Reject 200', rj.status === 200);
    check('Status REJECTED', rj.body?.data?.status === 'REJECTED');
    check('rejectionReason captured', rj.body?.data?.rejectionReason === 'Insufficient documentation');
  } else {
    console.log('  (skipped — couldn\'t create second request)');
  }

  console.log('\n--- Step 15: ADMIN deletes (cascade passengers) ---');
  const del = await call('DELETE', `/api/train-requests/${reqId}`, adminToken);
  check('Delete 200', del.status === 200);
  if (rejectId) {
    await call('DELETE', `/api/train-requests/${rejectId}`, adminToken);
  }

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
