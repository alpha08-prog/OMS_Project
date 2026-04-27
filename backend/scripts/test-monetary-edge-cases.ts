/**
 * Edge cases for monetaryValue:
 *   - Small integer (75)
 *   - Decimal (75.5)
 *   - Zero (0)
 *   - null
 *   - Empty string ('')
 *   - Field omitted (undefined)
 */
import 'dotenv/config';
import { generateToken } from '../src/utils/jwt';

const STAFF = {
  id: 'cc4afe35-c39a-4026-b925-d0b0e7386cfb',
  email: 'staff@oms.gov.in',
  role: 'STAFF' as const,
  name: 'Data Entry Staff',
};
const token = generateToken(STAFF);

const basePayload = {
  petitionerName: 'Test',
  mobileNumber: '9876543210',
  constituency: 'Test',
  grievanceType: 'FINANCIAL_AID',
  description: 'Edge case test for monetaryValue',
  actionRequired: 'NO_ACTION',
};

async function tryCreate(label: string, override: any) {
  const payload = { ...basePayload, ...override };
  const res = await fetch('http://localhost:5000/api/grievances', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json();
  const stored = json?.data?.monetaryValue;
  const sent = override.monetaryValue;
  const sentDisplay = sent === undefined ? '(omitted)' : JSON.stringify(sent);
  if (res.ok) {
    console.log(`  ${label.padEnd(30)} sent=${sentDisplay.padEnd(15)} → stored=${stored} ✓`);
    // Cleanup
    if (json?.data?.id) {
      const adminToken = generateToken({
        id: '8031293b-84a6-48e4-9f41-f11210db61cb',
        email: 'admin@oms.gov.in',
        role: 'ADMIN' as const,
        name: 'Office Administrator',
      });
      await fetch(`http://localhost:5000/api/grievances/${json.data.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
  } else {
    const msg = json?.errors?.[0]?.message || json?.message || 'unknown';
    console.log(`  ${label.padEnd(30)} sent=${sentDisplay.padEnd(15)} → HTTP ${res.status}: ${msg} ❌`);
  }
}

(async () => {
  console.log('=== monetaryValue edge cases ===\n');
  await tryCreate('Small integer (75)', { monetaryValue: 75 });
  await tryCreate('Decimal (75.5)', { monetaryValue: 75.5 });
  await tryCreate('Large value (1000000)', { monetaryValue: 1000000 });
  await tryCreate('Zero (0)', { monetaryValue: 0 });
  await tryCreate('null', { monetaryValue: null });
  await tryCreate('Empty string', { monetaryValue: '' });
  await tryCreate('Field omitted', {});
  await tryCreate('Negative (-10)', { monetaryValue: -10 });
  await tryCreate('String "abc"', { monetaryValue: 'abc' });
})();
