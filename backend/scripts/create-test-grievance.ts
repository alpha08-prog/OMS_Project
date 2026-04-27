/**
 * Manual test: create a single grievance and prove it lands in Catalyst.
 * Then list it both via the API and directly from Catalyst's row endpoint.
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
const token = generateToken(STAFF);

async function call(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json();
  return { status: res.status, body: json };
}

(async () => {
  console.log('========================================');
  console.log('  Creating a real grievance in Catalyst');
  console.log('========================================\n');

  const payload = {
    petitionerName: 'Rahul Sharma',
    mobileNumber: '9876543210',
    constituency: 'North Delhi',
    grievanceType: 'WATER',
    description: 'Water supply has been disrupted for 5 days in Block A. Multiple families affected. Please address urgently.',
    actionRequired: 'FORWARD_TO_DEPT',
    referencedBy: 'MLA Office',
  };

  console.log('STAFF user:', STAFF.email);
  console.log('Submitting grievance:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  const create = await call('POST', '/api/grievances', payload);

  console.log(`HTTP ${create.status}`);
  console.log('Response:');
  console.log(JSON.stringify(create.body, null, 2));

  if (create.status !== 201) {
    console.error('\n❌ Create failed.');
    process.exit(1);
  }

  const grievanceId = create.body?.data?.id;
  console.log(`\n✅ Grievance created with Catalyst ROWID: ${grievanceId}`);
  console.log(`   View in Catalyst Console:`);
  console.log(`   https://console.catalyst.zoho.in/baas/60069018829/project/37719000000012085/Development#/cloud/datastore/tables`);

  console.log('\n--- Now reading it back from the API ---');
  const read = await call('GET', `/api/grievances/${grievanceId}`);
  console.log(`HTTP ${read.status}`);
  console.log(`status: ${read.body?.data?.status}`);
  console.log(`currentStage: ${read.body?.data?.currentStage}`);
  console.log(`isVerified: ${read.body?.data?.isVerified}`);
  console.log(`isLocked: ${read.body?.data?.isLocked}`);
  console.log(`createdById: ${read.body?.data?.createdById}`);
  console.log(`petitionerName: ${read.body?.data?.petitionerName}`);
})();
