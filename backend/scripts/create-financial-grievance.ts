/**
 * Create a financial-aid grievance with a monetaryValue.
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

(async () => {
  const payload = {
    petitionerName: 'Priya Patel',
    mobileNumber: '9123456789',
    constituency: 'South Mumbai',
    grievanceType: 'FINANCIAL_AID',
    description: 'Request for medical treatment financial assistance for cardiac surgery. Family below poverty line.',
    monetaryValue: 75000.50,
    actionRequired: 'GENERATE_LETTER',
    referencedBy: 'Local Counsellor',
  };

  const res = await fetch('http://localhost:5000/api/grievances', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json: any = await res.json();
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
})();
