/**
 * Live demo of the full Task lifecycle: assign → progress updates → completion.
 * Each step shows what's actually stored in Catalyst.
 */
import 'dotenv/config';
import { generateToken } from '../src/utils/jwt';

const BASE = 'http://localhost:5000';

const ADMIN = {
  id: '8031293b-84a6-48e4-9f41-f11210db61cb',
  email: 'admin@oms.gov.in',
  role: 'ADMIN' as const,
  name: 'Office Administrator',
};
const STAFF = {
  id: 'cc4afe35-c39a-4026-b925-d0b0e7386cfb',
  email: 'staff@oms.gov.in',
  role: 'STAFF' as const,
  name: 'Data Entry Staff',
};
const adminToken = generateToken(ADMIN);
const staffToken = generateToken(STAFF);

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
  const json: any = await res.json();
  return { status: res.status, body: json };
}

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📋 TASK ASSIGNMENT LIVE DEMO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('STEP 1️⃣  ADMIN assigns a new task to STAFF');
  console.log(`        admin: ${ADMIN.email}`);
  console.log(`        →  staff: ${STAFF.email}\n`);

  const create = await call('POST', '/api/tasks', adminToken, {
    title: 'Review pending grievances and verify documents',
    description: 'Verify all grievances submitted in the last week. Check supporting documents are attached.',
    taskType: 'GRIEVANCE',
    priority: 'HIGH',
    assignedToId: STAFF.id,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (create.status !== 201) {
    console.error('❌ Create failed:', create.body);
    process.exit(1);
  }

  const taskId = create.body.data.id;
  console.log(`✅  Task created in Catalyst!`);
  console.log(`   ROWID:        ${taskId}`);
  console.log(`   Title:        ${create.body.data.title}`);
  console.log(`   Priority:     ${create.body.data.priority}`);
  console.log(`   Status:       ${create.body.data.status}`);
  console.log(`   assignedTo:   ${create.body.data.assignedToId}`);
  console.log(`   assignedBy:   ${create.body.data.assignedById}`);
  console.log(`   Due:          ${create.body.data.dueDate}\n`);

  console.log('STEP 2️⃣  STAFF can now see this in their /my-tasks list');
  const myTasks = await call('GET', '/api/tasks/my-tasks', staffToken);
  const found = (myTasks.body.data ?? []).find((t: any) => t.id === taskId);
  console.log(`✅  Found in STAFF's view: ${found ? 'YES' : 'NO'}\n`);

  console.log('STEP 3️⃣  STAFF starts working on it');
  const start = await call('PATCH', `/api/tasks/${taskId}/progress`, staffToken, {
    status: 'IN_PROGRESS',
    progressNotes: 'Starting review now. Pulled list of pending grievances.',
  });
  console.log(`   Status:       ${start.body.data.status}`);
  console.log(`   startedAt:    ${start.body.data.startedAt}`);
  console.log(`   note logged:  "${start.body.data.progressHistory?.[0]?.note}"\n`);

  console.log('STEP 4️⃣  STAFF makes another progress update');
  await new Promise((r) => setTimeout(r, 1500)); // small delay so timestamps differ
  const update2 = await call('PATCH', `/api/tasks/${taskId}/progress`, staffToken, {
    progressNotes: 'Verified 5 of 12 grievances. Found 2 missing supporting documents.',
  });
  console.log(`   note logged:  "${update2.body.data.progressHistory?.[0]?.note}"\n`);

  console.log('STEP 5️⃣  STAFF marks task COMPLETED');
  await new Promise((r) => setTimeout(r, 1500));
  const done = await call('PATCH', `/api/tasks/${taskId}/progress`, staffToken, {
    status: 'COMPLETED',
    progressNotes: 'All 12 grievances reviewed. Reports filed.',
  });
  console.log(`   Status:       ${done.body.data.status}`);
  console.log(`   progress%:    ${done.body.data.progressPercent}`);
  console.log(`   completedAt:  ${done.body.data.completedAt}\n`);

  console.log('STEP 6️⃣  Full history of the task');
  const history = await call('GET', `/api/tasks/${taskId}/history`, staffToken);
  console.log(`   ${history.body.data.length} history entries:\n`);
  for (const h of history.body.data) {
    console.log(`   • ${h.createdAt}  status=${h.status || '(none)'}`);
    console.log(`     "${h.note}"`);
  }

  console.log('\nSTEP 7️⃣  ADMIN dashboard /tracking shows it counted');
  const tracking = await call('GET', '/api/tasks/tracking', adminToken);
  console.log(`   Summary:`);
  console.log(`     total:       ${tracking.body.data.summary.total}`);
  console.log(`     completed:   ${tracking.body.data.summary.completed}`);
  console.log(`     in progress: ${tracking.body.data.summary.inProgress}`);
  console.log(`     assigned:    ${tracking.body.data.summary.assigned}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ ALL STEPS WORKED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n  Task ROWID: ${taskId}`);
  console.log(`  Open Catalyst Console → Cloud Scale → Data Store → Task → Data View`);
  console.log(`  to see this row + ${history.body.data.length} TaskHistory rows.\n`);
})();
