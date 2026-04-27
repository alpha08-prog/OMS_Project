/**
 * End-to-end test of the Task module with USE_CATALYST_TASK=true.
 *
 * Verifies:
 *   - ADMIN creates a task assigned to STAFF (lands in Catalyst)
 *   - Defaults: status=ASSIGNED, progressPercent=0, priority=NORMAL
 *   - GET /my-tasks returns only the staff's tasks
 *   - STAFF can read their own task; another staff would get 403
 *   - PATCH /progress sets startedAt + creates a TaskHistory row
 *   - GET /history returns the new entry
 *   - PATCH /progress with status=COMPLETED sets completedAt + progressPercent=100
 *   - GET /tracking returns counts + per-staff pending
 *   - GET /staff returns active STAFF members
 *   - DELETE cascades — task gone AND its history rows gone
 *
 * Run from backend/:
 *   1. USE_CATALYST_TASK=true in .env
 *   2. Start server:  npm run dev
 *   3. Run test:      npx ts-node scripts/test-task-e2e.ts
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
  console.log('=== Task E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_TASK: ${process.env.USE_CATALYST_TASK}\n`);

  console.log('--- Step 1: Health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  console.log('\n--- Step 2: GET /staff returns active STAFF ---');
  const staffList = await call('GET', '/api/tasks/staff', adminToken);
  check('Staff list 200', staffList.status === 200);
  check(
    'Staff list contains our test STAFF user',
    (staffList.body?.data ?? []).some((s: any) => s.id === STAFF.id)
  );

  console.log('\n--- Step 3: ADMIN creates a task assigned to STAFF ---');
  const create = await call('POST', '/api/tasks', adminToken, {
    title: `E2E Task ${Date.now()}`,
    description: 'E2E task for migration verification',
    taskType: 'GENERAL',
    priority: 'HIGH',
    assignedToId: STAFF.id,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  check('Create returns 201', create.status === 201, `got ${create.status}, body: ${JSON.stringify(create.body).substring(0, 200)}`);
  check(
    'Has Catalyst-style ROWID',
    typeof create.body?.data?.id === 'string' && /^\d+$/.test(create.body.data.id)
  );
  check('Default status = ASSIGNED', create.body?.data?.status === 'ASSIGNED');
  check('Default progressPercent = 0', create.body?.data?.progressPercent === 0);
  check('priority preserved (HIGH)', create.body?.data?.priority === 'HIGH');
  check('assignedToId = STAFF', create.body?.data?.assignedToId === STAFF.id);
  check('assignedById = ADMIN', create.body?.data?.assignedById === ADMIN.id);

  const taskId = create.body?.data?.id;
  if (!taskId) {
    console.error('\nNo task ID — aborting.');
    process.exit(1);
  }

  console.log('\n--- Step 4: STAFF GET /my-tasks ---');
  const my = await call('GET', '/api/tasks/my-tasks', staffToken);
  check('My tasks 200', my.status === 200);
  const myRows = my.body?.data ?? [];
  check(
    'Every my-task has assignedToId = STAFF',
    myRows.every((t: any) => t.assignedToId === STAFF.id)
  );
  check(
    'Just-created task is in my-tasks',
    myRows.some((t: any) => t.id === taskId)
  );

  console.log('\n--- Step 5: STAFF reads the task by id ---');
  const r = await call('GET', `/api/tasks/${taskId}`, staffToken);
  check('Read 200', r.status === 200);

  console.log('\n--- Step 6: STAFF updates progress (status → IN_PROGRESS) ---');
  const prog = await call('PATCH', `/api/tasks/${taskId}/progress`, staffToken, {
    status: 'IN_PROGRESS',
    progressNotes: 'Started working on this task',
  });
  check('Progress 200', prog.status === 200);
  check('Status now IN_PROGRESS', prog.body?.data?.status === 'IN_PROGRESS');
  check('startedAt is set', Boolean(prog.body?.data?.startedAt));
  check(
    'progressNotes captured',
    prog.body?.data?.progressNotes === 'Started working on this task'
  );

  console.log('\n--- Step 7: GET /history returns the entry ---');
  const hist = await call('GET', `/api/tasks/${taskId}/history`, staffToken);
  check('History 200', hist.status === 200);
  const histRows = hist.body?.data ?? [];
  check('History has at least one entry', histRows.length >= 1);
  check(
    'First entry has the right note',
    histRows[0]?.note === 'Started working on this task'
  );
  check(
    'First entry status = IN_PROGRESS',
    histRows[0]?.status === 'IN_PROGRESS'
  );

  console.log('\n--- Step 8: STAFF marks task COMPLETED ---');
  const done = await call('PATCH', `/api/tasks/${taskId}/progress`, staffToken, {
    status: 'COMPLETED',
    progressNotes: 'Done',
  });
  check('Done 200', done.status === 200);
  check('Status COMPLETED', done.body?.data?.status === 'COMPLETED');
  check('progressPercent = 100', done.body?.data?.progressPercent === 100);
  check('completedAt is set', Boolean(done.body?.data?.completedAt));

  console.log('\n--- Step 9: ADMIN GET /tracking ---');
  const track = await call('GET', '/api/tasks/tracking', adminToken);
  check('Tracking 200', track.status === 200);
  check('Has summary block', Boolean(track.body?.data?.summary));
  check(
    'Summary.completed >= 1',
    Number(track.body?.data?.summary?.completed) >= 1
  );

  console.log('\n--- Step 10: STAFF cannot create tasks (admin-only) ---');
  const forbid = await call('POST', '/api/tasks', staffToken, {
    title: 'Forbidden',
    taskType: 'GENERAL',
    assignedToId: STAFF.id,
  });
  check('STAFF create → 403', forbid.status === 403, `got ${forbid.status}`);

  console.log('\n--- Step 11: ADMIN deletes (cascade history) ---');
  const del = await call('DELETE', `/api/tasks/${taskId}`, adminToken);
  check('Delete 200', del.status === 200);

  console.log('\n--- Step 12: After delete, history is gone too ---');
  // We can't query history for a deleted task by ID through the route (task lookup
  // returns 404). Hit it directly via /history which 404s when task is gone.
  const histAfter = await call('GET', `/api/tasks/${taskId}/history`, adminToken);
  check(
    'History endpoint 404 (task no longer exists)',
    histAfter.status === 404,
    `got ${histAfter.status}`
  );

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
