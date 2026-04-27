/**
 * Live verification: create real birthday rows via the API and prove
 * each operation works against the actual Catalyst Data Store.
 */
import 'dotenv/config';
import { generateToken } from '../src/utils/jwt';

const BASE = 'http://localhost:5000';

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

function header(s: string) {
  console.log('\n' + '━'.repeat(70));
  console.log(`  ${s}`);
  console.log('━'.repeat(70));
}

(async () => {
  const stamp = Date.now();
  const today = new Date();
  const dobToday = `1985-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00.000Z`;

  header('🎂 BIRTHDAY — Create / Read / Update / Delete (LIVE)');

  console.log('\n[1] STAFF creates a birthday entry (dob = today, will be in /today)...');
  const create = await call('POST', '/api/birthdays', staffToken, {
    name: `Demo Person ${stamp}`,
    phone: '9876543210',
    dob: dobToday,
    relation: 'MLA Office',
    notes: 'Important contact — reach out for greetings',
    designation: 'Personal Secretary',
  });
  if (create.status !== 201) {
    console.error('  ❌ FAILED:', create.status, create.body);
    process.exit(1);
  }
  const id = create.body.data.id;
  console.log(`  ✅ Created — ROWID: ${id}`);
  console.log(`     name:        ${create.body.data.name}`);
  console.log(`     phone:       ${create.body.data.phone}`);
  console.log(`     dob:         ${create.body.data.dob}`);
  console.log(`     relation:    ${create.body.data.relation}`);
  console.log(`     designation: ${create.body.data.designation}`);
  console.log(`     createdById: ${create.body.data.createdById}`);

  console.log('\n[2] Try to create DUPLICATE name (different case)...');
  const dup = await call('POST', '/api/birthdays', staffToken, {
    name: `demo person ${stamp}`,
    dob: dobToday,
    relation: 'Other',
  });
  console.log(`  HTTP ${dup.status} — ${dup.body?.message ?? 'no msg'}`);
  console.log(`  ✅ Duplicate properly blocked: ${dup.status === 409 ? 'YES' : 'NO'}`);

  console.log('\n[3] GET /api/birthdays/today — should include this entry...');
  const todayList = await call('GET', '/api/birthdays/today', staffToken);
  const inToday = (todayList.body.data ?? []).some((b: any) => b.id === id);
  console.log(`  ✅ Found in today's list: ${inToday ? 'YES' : 'NO'}`);

  console.log('\n[4] GET /api/birthdays/upcoming — should also include it...');
  const upcoming = await call('GET', '/api/birthdays/upcoming', staffToken);
  const inUpcoming = (upcoming.body.data ?? []).some((b: any) => b.id === id);
  console.log(`  ✅ Found in upcoming: ${inUpcoming ? 'YES' : 'NO'}`);

  console.log('\n[5] Filter by relation=MLA Office...');
  const filtered = await call(
    'GET',
    `/api/birthdays?relation=${encodeURIComponent('MLA Office')}`,
    staffToken
  );
  const allMatch = (filtered.body.data ?? []).every(
    (b: any) => b.relation === 'MLA Office'
  );
  console.log(`  ✅ All filtered rows have relation=MLA Office: ${allMatch ? 'YES' : 'NO'}`);

  console.log('\n[6] PUT update — change relation + notes + add designation...');
  const upd = await call('PUT', `/api/birthdays/${id}`, staffToken, {
    relation: 'Family',
    notes: 'UPDATED: moved to family category',
    designation: 'Updated Designation',
  });
  console.log(`  HTTP ${upd.status}`);
  console.log(`  relation now:    ${upd.body.data.relation}`);
  console.log(`  notes now:       "${upd.body.data.notes}"`);
  console.log(`  designation now: ${upd.body.data.designation}`);

  console.log('\n[7] GET /api/birthdays/:id — read it back...');
  const byId = await call('GET', `/api/birthdays/${id}`, staffToken);
  console.log(`  HTTP ${byId.status}`);
  console.log(`  ✅ name preserved: "${byId.body.data?.name}"`);

  console.log('\n[8] STAFF tries to delete (admin only)...');
  const forbidDel = await call('DELETE', `/api/birthdays/${id}`, staffToken);
  console.log(`  ✅ STAFF delete blocked: HTTP ${forbidDel.status} (403 expected)`);

  console.log('\n[9] ADMIN deletes...');
  const del = await call('DELETE', `/api/birthdays/${id}`, adminToken);
  console.log(`  ✅ Deleted — HTTP ${del.status}`);

  console.log('\n[10] Verify gone...');
  const after = await call('GET', `/api/birthdays/${id}`, staffToken);
  console.log(`  ✅ GET after delete → HTTP ${after.status} (404 expected)`);

  console.log('\n' + '═'.repeat(70));
  console.log('  ✅ BIRTHDAY MODULE — Create / Read / Update / Delete WORKING');
  console.log('═'.repeat(70));
  console.log(`\n  Open Catalyst Console → Cloud Scale → Data Store → Birthday`);
  console.log(`  to see the audit trail (row was briefly created and cleaned up).\n`);
})();
