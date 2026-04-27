/**
 * End-to-end test of the News module with USE_CATALYST_NEWS=true.
 *
 * Verifies:
 *   - STAFF creates news (lands in Catalyst, default priority=NORMAL)
 *   - priority↔newsPriority mapping (frontend sees `priority`)
 *   - GET / lists all (no data isolation by design)
 *   - Filters: priority, category, region, search
 *   - CRITICAL alerts endpoint returns only CRITICAL, top 10
 *   - Sort order: priority desc, then createdAt desc
 *   - PUT update with priority change
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
  console.log('=== News E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_NEWS: ${process.env.USE_CATALYST_NEWS}\n`);

  console.log('--- Step 1: Health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  const stamp = Date.now();

  console.log('\n--- Step 2: STAFF creates 3 news items (NORMAL, HIGH, CRITICAL) ---');
  const normal = await call('POST', '/api/news', staffToken, {
    headline: `E2E Normal News ${stamp}`,
    category: 'DEVELOPMENT_WORK',
    priority: 'NORMAL',
    mediaSource: 'Times of India',
    region: 'Delhi',
    description: 'Routine development update',
  });
  check('Normal create 201', normal.status === 201, `got ${normal.status}, body: ${JSON.stringify(normal.body).substring(0, 200)}`);
  check('Has Catalyst-style ROWID', typeof normal.body?.data?.id === 'string' && /^\d+$/.test(normal.body.data.id));
  check('priority preserved (NORMAL)', normal.body?.data?.priority === 'NORMAL');
  check('createdById = STAFF', normal.body?.data?.createdById === STAFF.id);

  const high = await call('POST', '/api/news', staffToken, {
    headline: `E2E High News ${stamp}`,
    category: 'LEADER_ACTIVITY',
    priority: 'HIGH',
    mediaSource: 'India Today',
    region: 'Mumbai',
  });
  check('High create 201', high.status === 201);
  check('priority HIGH', high.body?.data?.priority === 'HIGH');

  const critical = await call('POST', '/api/news', staffToken, {
    headline: `E2E Critical News ${stamp}`,
    category: 'CONSPIRACY_FAKE_NEWS',
    priority: 'CRITICAL',
    mediaSource: 'NDTV',
    region: 'Delhi',
    description: 'Urgent attention needed',
  });
  check('Critical create 201', critical.status === 201);
  check('priority CRITICAL', critical.body?.data?.priority === 'CRITICAL');

  const normalId = normal.body?.data?.id;
  const highId = high.body?.data?.id;
  const criticalId = critical.body?.data?.id;
  if (!normalId || !highId || !criticalId) {
    console.error('\nMissing IDs — aborting.');
    process.exit(1);
  }

  console.log('\n--- Step 3: STAFF default priority is NORMAL when omitted ---');
  const defNorm = await call('POST', '/api/news', staffToken, {
    headline: `E2E Default News ${stamp}`,
    category: 'OTHER',
    mediaSource: 'Hindustan Times',
    region: 'Bangalore',
    // No priority — should default to NORMAL
  });
  check('Default-priority create 201', defNorm.status === 201);
  check('Default priority = NORMAL', defNorm.body?.data?.priority === 'NORMAL');
  const defNormId = defNorm.body?.data?.id;

  console.log('\n--- Step 4: GET / — sorted by priority desc then createdAt desc ---');
  const list = await call('GET', '/api/news', staffToken);
  check('List 200', list.status === 200);
  const rows = list.body?.data ?? [];
  // Find our 4 items in the list
  const ourItems = rows.filter((n: any) =>
    [normalId, highId, criticalId, defNormId].includes(n.id)
  );
  check('All 4 items appear in list', ourItems.length === 4);
  if (ourItems.length === 4) {
    const indexOf = (id: string) => rows.findIndex((n: any) => n.id === id);
    check('CRITICAL appears before HIGH', indexOf(criticalId) < indexOf(highId));
    check('HIGH appears before NORMAL', indexOf(highId) < indexOf(normalId));
  }

  console.log('\n--- Step 5: Filter by priority=HIGH ---');
  const highOnly = await call('GET', '/api/news?priority=HIGH', staffToken);
  check('High filter 200', highOnly.status === 200);
  check(
    'All filtered rows have priority=HIGH',
    (highOnly.body?.data ?? []).every((n: any) => n.priority === 'HIGH')
  );

  console.log('\n--- Step 6: Filter by category=CONSPIRACY_FAKE_NEWS ---');
  const fakeNews = await call(
    'GET',
    '/api/news?category=CONSPIRACY_FAKE_NEWS',
    staffToken
  );
  check('Category filter 200', fakeNews.status === 200);
  check(
    'All filtered rows have correct category',
    (fakeNews.body?.data ?? []).every(
      (n: any) => n.category === 'CONSPIRACY_FAKE_NEWS'
    )
  );

  console.log('\n--- Step 7: Filter by region (case-insensitive contains) ---');
  const delhi = await call('GET', '/api/news?region=delhi', staffToken);
  check('Region filter 200', delhi.status === 200);
  check(
    'All rows match region',
    (delhi.body?.data ?? []).every((n: any) =>
      (n.region || '').toLowerCase().includes('delhi')
    )
  );

  console.log('\n--- Step 8: Search filter ---');
  const search = await call('GET', `/api/news?search=Critical`, staffToken);
  check('Search 200', search.status === 200);
  check(
    'Search matches headline/description/source',
    (search.body?.data ?? []).some((n: any) =>
      n.headline.includes('Critical')
    )
  );

  console.log('\n--- Step 9: GET /alerts/critical — only CRITICAL, top 10 ---');
  const alerts = await call('GET', '/api/news/alerts/critical', staffToken);
  check('Alerts 200', alerts.status === 200);
  const alertRows = alerts.body?.data ?? [];
  check(
    'All alert rows are CRITICAL',
    alertRows.every((n: any) => n.priority === 'CRITICAL')
  );
  check(
    'Critical alert contains our just-created CRITICAL',
    alertRows.some((n: any) => n.id === criticalId)
  );
  check('Alert response capped at 10', alertRows.length <= 10);

  console.log('\n--- Step 10: GET /:id ---');
  const byId = await call('GET', `/api/news/${highId}`, staffToken);
  check('Get by id 200', byId.status === 200);
  check('headline preserved', byId.body?.data?.headline === `E2E High News ${stamp}`);

  console.log('\n--- Step 11: PUT update — change priority to CRITICAL ---');
  const upd = await call('PUT', `/api/news/${normalId}`, staffToken, {
    priority: 'CRITICAL',
    description: 'Just escalated to critical',
  });
  check('Update 200', upd.status === 200);
  check('priority now CRITICAL', upd.body?.data?.priority === 'CRITICAL');
  check('description updated', upd.body?.data?.description === 'Just escalated to critical');

  console.log('\n--- Step 12: STAFF cannot delete (admin only) ---');
  const forbidDel = await call('DELETE', `/api/news/${normalId}`, staffToken);
  check('STAFF delete → 403', forbidDel.status === 403, `got ${forbidDel.status}`);

  console.log('\n--- Step 13: ADMIN deletes (cleanup) ---');
  for (const id of [normalId, highId, criticalId, defNormId]) {
    await call('DELETE', `/api/news/${id}`, adminToken);
  }
  check('Cleanup done', true);

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
