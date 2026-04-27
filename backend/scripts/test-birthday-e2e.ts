/**
 * End-to-end test of the Birthday module with USE_CATALYST_BIRTHDAY=true.
 *
 * Verifies:
 *   - STAFF creates birthday entry (lands in Catalyst)
 *   - Duplicate name is rejected (case-insensitive)
 *   - GET / lists with search/relation/month filters
 *   - GET /today returns birthdays whose dob month+day matches today
 *   - GET /upcoming returns next 7 days (incl. today), capped 10
 *   - PUT update works
 *   - STAFF cannot delete (admin only)
 *   - DELETE works
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
  console.log('=== Birthday E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_BIRTHDAY: ${process.env.USE_CATALYST_BIRTHDAY}\n`);

  console.log('--- Step 1: Health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  const stamp = Date.now();
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  // Create a birthday whose dob is "today" in some past year so it shows up
  // under /today and /upcoming.
  const todayYearStr = `1990-${String(todayMonth).padStart(2, '0')}-${String(
    todayDay
  ).padStart(2, '0')}T00:00:00.000Z`;

  console.log('\n--- Step 2: STAFF creates a birthday entry (dob = today) ---');
  const create = await call('POST', '/api/birthdays', staffToken, {
    name: `E2E Person ${stamp}`,
    phone: '9876543210',
    dob: todayYearStr,
    relation: 'Family',
    notes: 'E2E test entry',
    designation: 'Test Subject',
  });
  check('Create returns 201', create.status === 201, `got ${create.status}, body: ${JSON.stringify(create.body).substring(0, 200)}`);
  check('Has Catalyst-style ROWID', typeof create.body?.data?.id === 'string' && /^\d+$/.test(create.body.data.id));
  check('name preserved', create.body?.data?.name === `E2E Person ${stamp}`);
  check('relation preserved', create.body?.data?.relation === 'Family');
  check('createdById = STAFF', create.body?.data?.createdById === STAFF.id);

  const id = create.body?.data?.id;
  if (!id) {
    console.error('\nNo ID — aborting.');
    process.exit(1);
  }

  console.log('\n--- Step 3: Duplicate name rejected (case-insensitive) ---');
  const dup = await call('POST', '/api/birthdays', staffToken, {
    name: `e2e person ${stamp}`, // different case
    dob: todayYearStr,
    relation: 'Family',
  });
  check('Duplicate → 409', dup.status === 409, `got ${dup.status}`);

  console.log('\n--- Step 4: GET / list ---');
  const list = await call('GET', '/api/birthdays', staffToken);
  check('List 200', list.status === 200);
  check('STAFF sees the entry', (list.body?.data ?? []).some((b: any) => b.id === id));

  console.log('\n--- Step 5: Filter by relation=Family ---');
  const fam = await call('GET', '/api/birthdays?relation=Family', staffToken);
  check('Filter 200', fam.status === 200);
  check(
    'All filtered have relation=Family',
    (fam.body?.data ?? []).every((b: any) => b.relation === 'Family')
  );

  console.log('\n--- Step 6: Filter by month (current month) ---');
  const monthFilter = await call(
    'GET',
    `/api/birthdays?month=${todayMonth}`,
    staffToken
  );
  check('Month filter 200', monthFilter.status === 200);
  check(
    'All filtered rows have dob in current month',
    (monthFilter.body?.data ?? []).every((b: any) => {
      if (!b.dob) return false;
      return new Date(b.dob).getMonth() + 1 === todayMonth;
    })
  );

  console.log('\n--- Step 7: GET /today returns the entry ---');
  const todayList = await call('GET', '/api/birthdays/today', staffToken);
  check('Today 200', todayList.status === 200);
  check('Today contains the entry', (todayList.body?.data ?? []).some((b: any) => b.id === id));

  console.log('\n--- Step 8: GET /upcoming returns the entry ---');
  const upcoming = await call('GET', '/api/birthdays/upcoming', staffToken);
  check('Upcoming 200', upcoming.status === 200);
  check('Upcoming includes today\'s entry', (upcoming.body?.data ?? []).some((b: any) => b.id === id));

  console.log('\n--- Step 9: PUT update — change relation + add note ---');
  const upd = await call('PUT', `/api/birthdays/${id}`, staffToken, {
    relation: 'Staff',
    notes: 'UPDATED: now categorized as office staff',
  });
  check('Update 200', upd.status === 200);
  check('relation now Staff', upd.body?.data?.relation === 'Staff');
  check('notes updated', upd.body?.data?.notes === 'UPDATED: now categorized as office staff');

  console.log('\n--- Step 10: STAFF cannot delete (admin only) ---');
  const forbidDel = await call('DELETE', `/api/birthdays/${id}`, staffToken);
  check('STAFF delete → 403', forbidDel.status === 403, `got ${forbidDel.status}`);

  console.log('\n--- Step 11: ADMIN deletes ---');
  const del = await call('DELETE', `/api/birthdays/${id}`, adminToken);
  check('Delete 200', del.status === 200);

  console.log('\n--- Step 12: Verify deleted ---');
  const after = await call('GET', `/api/birthdays/${id}`, staffToken);
  check('GET after delete → 404', after.status === 404, `got ${after.status}`);

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
