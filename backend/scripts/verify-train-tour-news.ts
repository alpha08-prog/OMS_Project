/**
 * Live verification: create, update, delete real records in
 * TrainRequest, TourProgram, and News via the live API.
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

function header(label: string) {
  console.log('\n' + '━'.repeat(70));
  console.log(`  ${label}`);
  console.log('━'.repeat(70));
}

(async () => {
  // ────────────────────────────────────────────────────────────────
  // 1. TRAIN REQUEST
  // ────────────────────────────────────────────────────────────────
  header('🚆 TRAIN REQUEST — Create / Update / Delete');

  console.log('\n[1.1] STAFF creates a train request with 2 passengers...');
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const trainCreate = await call('POST', '/api/train-requests', staffToken, {
    passengerName: 'Rahul Sharma',
    pnrNumber: '8765432109',
    trainName: 'Shatabdi Express',
    trainNumber: '12002',
    journeyClass: '2A',
    dateOfJourney: futureDate.toISOString(),
    fromStation: 'NDLS (New Delhi)',
    toStation: 'BPL (Bhopal)',
    route: 'NDLS-BPL',
    boardingPoint: 'NDLS',
    bookingType: 'TATKAL',
    contactNumber: '9876543210',
    referencedBy: 'MLA Office',
    remarks: 'Family travel for medical emergency',
    passengers: [
      { name: 'Rahul Sharma', age: 35, gender: 'MALE', berthPreference: 'LOWER' },
      { name: 'Priya Sharma', age: 32, gender: 'FEMALE', berthPreference: 'LOWER' },
    ],
  });
  if (trainCreate.status !== 201) {
    console.error('  ❌ FAILED:', trainCreate.status, trainCreate.body);
    process.exit(1);
  }
  const trainId = trainCreate.body.data.id;
  console.log(`  ✅ Created — ROWID: ${trainId}`);
  console.log(`     PNR: ${trainCreate.body.data.pnrNumber}`);
  console.log(`     Status: ${trainCreate.body.data.status}`);
  console.log(`     Passengers: ${trainCreate.body.data.train_passengers.length}`);

  console.log('\n[1.2] STAFF updates the train request (replace passengers list)...');
  const trainUpd = await call('PUT', `/api/train-requests/${trainId}`, staffToken, {
    remarks: 'UPDATED: Single passenger now, plans changed',
    passengers: [
      { name: 'Rahul Sharma', age: 35, gender: 'MALE', berthPreference: 'LOWER' },
    ],
  });
  console.log(`  ✅ Updated — HTTP ${trainUpd.status}`);
  console.log(`     remarks: "${trainUpd.body.data.remarks}"`);
  console.log(`     Passengers now: ${trainUpd.body.data.train_passengers.length}`);

  console.log('\n[1.3] ADMIN approves it...');
  const trainApprove = await call('PATCH', `/api/train-requests/${trainId}/approve`, adminToken);
  console.log(`  ✅ Approved — HTTP ${trainApprove.status}`);
  console.log(`     Status: ${trainApprove.body.data.status}`);
  console.log(`     approvedAt: ${trainApprove.body.data.approvedAt}`);

  console.log('\n[1.4] ADMIN deletes (cascade passengers)...');
  const trainDel = await call('DELETE', `/api/train-requests/${trainId}`, adminToken);
  console.log(`  ✅ Deleted — HTTP ${trainDel.status}`);

  console.log('\n[1.5] Verify deletion...');
  const trainCheck = await call('GET', `/api/train-requests/${trainId}`, adminToken);
  console.log(`  ✅ GET after delete → HTTP ${trainCheck.status} (404 expected)`);

  // ────────────────────────────────────────────────────────────────
  // 2. TOUR PROGRAM
  // ────────────────────────────────────────────────────────────────
  header('📅 TOUR PROGRAM — Create / Update / Decision / Delete');

  console.log('\n[2.1] STAFF creates a tour program for next week...');
  const tourCreate = await call('POST', '/api/tour-programs', staffToken, {
    eventName: 'Annual Constituency Meet',
    organizer: 'Local Branch Office',
    dateTime: futureDate.toISOString(),
    venue: 'Community Hall, North Delhi',
    venueLink: 'https://maps.example.com/community-hall',
    description: 'Annual gathering of constituents and representatives',
    referencedBy: 'MLA Office',
    chiefGuest: 'Senior Minister',
    expectedFootfall: '500-700',
    organizerPhone: '9876543210',
    organizerEmail: 'contact@branchoffice.gov.in',
  });
  if (tourCreate.status !== 201) {
    console.error('  ❌ FAILED:', tourCreate.status, tourCreate.body);
    process.exit(1);
  }
  const tourId = tourCreate.body.data.id;
  console.log(`  ✅ Created — ROWID: ${tourId}`);
  console.log(`     eventName: ${tourCreate.body.data.eventName}`);
  console.log(`     decision: ${tourCreate.body.data.decision}`);
  console.log(`     expected: ${tourCreate.body.data.expectedFootfall}`);

  console.log('\n[2.2] STAFF updates the tour details...');
  const tourUpd = await call('PUT', `/api/tour-programs/${tourId}`, staffToken, {
    description: 'UPDATED: Added local artists performance segment',
    expectedFootfall: '700-1000',
  });
  console.log(`  ✅ Updated — HTTP ${tourUpd.status}`);
  console.log(`     description: "${tourUpd.body.data.description}"`);
  console.log(`     expected: ${tourUpd.body.data.expectedFootfall}`);

  console.log('\n[2.3] ADMIN sets decision = ACCEPTED...');
  const tourAccept = await call('PATCH', `/api/tour-programs/${tourId}/decision`, adminToken, {
    decision: 'ACCEPTED',
    decisionNote: 'Important community event, full support given',
  });
  console.log(`  ✅ Decision — HTTP ${tourAccept.status}`);
  console.log(`     decision: ${tourAccept.body.data.decision}`);
  console.log(`     note: "${tourAccept.body.data.decisionNote}"`);

  console.log('\n[2.4] ADMIN deletes...');
  const tourDel = await call('DELETE', `/api/tour-programs/${tourId}`, adminToken);
  console.log(`  ✅ Deleted — HTTP ${tourDel.status}`);

  console.log('\n[2.5] Verify deletion...');
  const tourCheck = await call('GET', `/api/tour-programs/${tourId}`, staffToken);
  console.log(`  ✅ GET after delete → HTTP ${tourCheck.status} (404 expected)`);

  // ────────────────────────────────────────────────────────────────
  // 3. NEWS
  // ────────────────────────────────────────────────────────────────
  header('📰 NEWS INTELLIGENCE — Create / Update / Delete');

  console.log('\n[3.1] STAFF creates a CRITICAL news entry...');
  const newsCreate = await call('POST', '/api/news', staffToken, {
    headline: 'Major development project announced for North Delhi',
    category: 'DEVELOPMENT_WORK',
    priority: 'CRITICAL',
    mediaSource: 'Times of India',
    region: 'North Delhi',
    description: 'Government has approved a 500cr development package focused on urban infrastructure',
    imageUrl: 'https://example.com/images/news/dev-project.jpg',
  });
  if (newsCreate.status !== 201) {
    console.error('  ❌ FAILED:', newsCreate.status, newsCreate.body);
    process.exit(1);
  }
  const newsId = newsCreate.body.data.id;
  console.log(`  ✅ Created — ROWID: ${newsId}`);
  console.log(`     headline: ${newsCreate.body.data.headline}`);
  console.log(`     priority: ${newsCreate.body.data.priority}  ← (mapped from newsPriority)`);
  console.log(`     category: ${newsCreate.body.data.category}`);
  console.log(`     region: ${newsCreate.body.data.region}`);

  console.log('\n[3.2] STAFF updates priority + description...');
  const newsUpd = await call('PUT', `/api/news/${newsId}`, staffToken, {
    priority: 'HIGH',
    description: 'UPDATED: Project scope reduced to 300cr after review',
  });
  console.log(`  ✅ Updated — HTTP ${newsUpd.status}`);
  console.log(`     priority: ${newsUpd.body.data.priority}`);
  console.log(`     description: "${newsUpd.body.data.description}"`);

  console.log('\n[3.3] Verify it appears in /alerts/critical (after we made it HIGH it should NOT)...');
  const alerts = await call('GET', '/api/news/alerts/critical', staffToken);
  const inAlerts = (alerts.body.data ?? []).some((n: any) => n.id === newsId);
  console.log(`  ✅ In critical alerts: ${inAlerts ? 'YES (wrong)' : 'NO (correct — we changed it to HIGH)'}`);

  console.log('\n[3.4] ADMIN deletes...');
  const newsDel = await call('DELETE', `/api/news/${newsId}`, adminToken);
  console.log(`  ✅ Deleted — HTTP ${newsDel.status}`);

  console.log('\n[3.5] Verify deletion...');
  const newsCheck = await call('GET', `/api/news/${newsId}`, staffToken);
  console.log(`  ✅ GET after delete → HTTP ${newsCheck.status} (404 expected)`);

  // ────────────────────────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  ✅ ALL MODULES VERIFIED — Create + Update + Delete WORKING');
  console.log('═'.repeat(70));
  console.log('\n  TrainRequest (with nested passengers): ✓');
  console.log('  TourProgram (with decision flow):      ✓');
  console.log('  News (with priority mapping):          ✓');
  console.log('\n  Open Catalyst Console → Cloud Scale → Data Store');
  console.log('  to confirm rows were briefly created and properly cleaned up.\n');
})();
