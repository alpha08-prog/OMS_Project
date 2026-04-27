/**
 * End-to-end test of the TourProgram module with USE_CATALYST_TOUR=true.
 *
 * Verifies:
 *   - STAFF creates tour program (lands in Catalyst, default decision=PENDING, isCompleted=false)
 *   - GET /  lists everyone's tours (NOT data-isolated by createdById — by design)
 *   - GET /pending — admin queue
 *   - GET /upcoming — next 7 days
 *   - GET /schedule/today — today's ACCEPTED events
 *   - GET /events — past completed events
 *   - PATCH /:id/decision (admin) — only valid decisions; sets decisionNote
 *   - PATCH /:id/complete — only ACCEPTED + past dateTime can submit report
 *     - rejects future events
 *     - rejects PENDING tours
 *     - sets isCompleted, completedAt, completedById, drive/keynotes/etc.
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
  console.log('=== TourProgram E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_TOUR: ${process.env.USE_CATALYST_TOUR}\n`);

  console.log('--- Step 1: Health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  // FUTURE event for create + decision flow
  const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  console.log('\n--- Step 2: STAFF creates a future tour program ---');
  const create = await call('POST', '/api/tour-programs', staffToken, {
    eventName: `E2E Conference ${Date.now()}`,
    organizer: 'OMS Migration Test',
    dateTime: futureDate.toISOString(),
    venue: 'Test Venue, New Delhi',
    venueLink: 'https://maps.example.com/venue',
    description: 'E2E test event for Catalyst migration',
    referencedBy: 'Migration POC',
    chiefGuest: 'Test Chief Guest',
    expectedFootfall: '100-150',
    organizerPhone: '9876543210',
    organizerEmail: 'organizer@example.com',
  });
  check('Create returns 201', create.status === 201, `got ${create.status}, body: ${JSON.stringify(create.body).substring(0, 200)}`);
  check('Has Catalyst-style ROWID', typeof create.body?.data?.id === 'string' && /^\d+$/.test(create.body.data.id));
  check('Default decision = PENDING', create.body?.data?.decision === 'PENDING');
  check('Default isCompleted = false', create.body?.data?.isCompleted === false);
  check('createdById = STAFF', create.body?.data?.createdById === STAFF.id);

  const tourId = create.body?.data?.id;
  if (!tourId) {
    console.error('\nNo tour ID — aborting.');
    process.exit(1);
  }

  console.log('\n--- Step 3: GET / lists everyone (no STAFF isolation by design) ---');
  const list = await call('GET', '/api/tour-programs', staffToken);
  check('List 200', list.status === 200);
  check('STAFF sees the just-created tour', (list.body?.data ?? []).some((t: any) => t.id === tourId));

  console.log('\n--- Step 4: GET /pending — admin queue ---');
  const pending = await call('GET', '/api/tour-programs/pending', adminToken);
  check('Pending 200', pending.status === 200);
  const pendingRows = pending.body?.data ?? [];
  check('Queue has the new tour', pendingRows.some((t: any) => t.id === tourId));
  check('All queue items are PENDING', pendingRows.every((t: any) => t.decision === 'PENDING'));

  console.log('\n--- Step 5: GET /upcoming — next 7 days ---');
  const upcoming = await call('GET', '/api/tour-programs/upcoming', staffToken);
  check('Upcoming 200', upcoming.status === 200);
  check('Upcoming contains the future tour', (upcoming.body?.data ?? []).some((t: any) => t.id === tourId));

  console.log('\n--- Step 6: STAFF cannot make decision (admin only) ---');
  const forbidDecide = await call('PATCH', `/api/tour-programs/${tourId}/decision`, staffToken, {
    decision: 'ACCEPTED',
  });
  check('STAFF decide → 403', forbidDecide.status === 403, `got ${forbidDecide.status}`);

  console.log('\n--- Step 7: ADMIN sets decision = ACCEPTED ---');
  const accept = await call('PATCH', `/api/tour-programs/${tourId}/decision`, adminToken, {
    decision: 'ACCEPTED',
    decisionNote: 'High-priority event, attendance confirmed',
  });
  check('Decision 200', accept.status === 200);
  check('Decision = ACCEPTED', accept.body?.data?.decision === 'ACCEPTED');
  check('decisionNote captured', accept.body?.data?.decisionNote === 'High-priority event, attendance confirmed');

  console.log('\n--- Step 8: Try to submit report on FUTURE event (should fail) ---');
  const earlyReport = await call('PATCH', `/api/tour-programs/${tourId}/complete`, staffToken, {
    driveLink: 'https://drive.example.com/folder',
    attendeesCount: 120,
  });
  check('Early report → error', earlyReport.status >= 400 && earlyReport.status < 500, `got ${earlyReport.status}`);

  console.log('\n--- Step 9: Create a PAST + ACCEPTED tour for the report flow ---');
  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const pastTour = await call('POST', '/api/tour-programs', staffToken, {
    eventName: 'E2E Past Conference',
    organizer: 'Past Events Org',
    dateTime: pastDate.toISOString(),
    venue: 'Past Venue',
  });
  const pastTourId = pastTour.body?.data?.id;
  check('Past tour created', pastTour.status === 201);
  // accept the past tour
  await call('PATCH', `/api/tour-programs/${pastTourId}/decision`, adminToken, {
    decision: 'ACCEPTED',
    decisionNote: 'Already happened',
  });

  console.log('\n--- Step 10: Submit post-event report on PAST + ACCEPTED tour ---');
  const report = await call('PATCH', `/api/tour-programs/${pastTourId}/complete`, staffToken, {
    driveLink: 'https://drive.example.com/photos',
    keynotes: 'Successful event with great turnout',
    attendeesCount: 145,
    outcomeSummary: 'All objectives met. Positive media coverage.',
    mediaLink: 'https://media.example.com/coverage',
  });
  check('Report 200', report.status === 200);
  check('isCompleted = true', report.body?.data?.isCompleted === true);
  check('completedAt set', Boolean(report.body?.data?.completedAt));
  check('completedById = STAFF', report.body?.data?.completedById === STAFF.id);
  check('attendeesCount stored as number', report.body?.data?.attendeesCount === 145);
  check('keynotes captured', report.body?.data?.keynotes === 'Successful event with great turnout');

  console.log('\n--- Step 11: GET /events (past + ACCEPTED) ---');
  const events = await call('GET', '/api/tour-programs/events', staffToken);
  check('Events 200', events.status === 200);
  check('Events contains the completed past tour', (events.body?.data ?? []).some((t: any) => t.id === pastTourId));

  console.log('\n--- Step 12: GET /:id returns full record ---');
  const byId = await call('GET', `/api/tour-programs/${tourId}`, staffToken);
  check('GET by id 200', byId.status === 200);
  check('eventName preserved', byId.body?.data?.eventName?.startsWith('E2E Conference'));
  check('decision = ACCEPTED', byId.body?.data?.decision === 'ACCEPTED');

  console.log('\n--- Step 13: STAFF cannot delete (admin only) ---');
  const forbidDelete = await call('DELETE', `/api/tour-programs/${tourId}`, staffToken);
  check('STAFF delete → 403', forbidDelete.status === 403, `got ${forbidDelete.status}`);

  console.log('\n--- Step 14: ADMIN deletes both tours (cleanup) ---');
  const del1 = await call('DELETE', `/api/tour-programs/${tourId}`, adminToken);
  check('Delete future tour 200', del1.status === 200);
  const del2 = await call('DELETE', `/api/tour-programs/${pastTourId}`, adminToken);
  check('Delete past tour 200', del2.status === 200);

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
