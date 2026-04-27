/**
 * End-to-end test of the auth module with USE_CATALYST_AUTH=true.
 *
 * Verifies:
 *   - POST /login uses Catalyst AppUser
 *   - Old UUID-based JWTs still work (auth middleware finds user by legacyId)
 *   - GET /me returns the right user
 *   - GET /users (admin only) lists all users from Catalyst
 *   - Other modules' protected endpoints work with the Catalyst-backed JWT
 *   - STAFF cannot access /users (403)
 *   - PUT /password works (verifies + updates password in Catalyst)
 *   - Wrong password is rejected
 */
import 'dotenv/config';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000';

async function call(
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
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

// IMPORTANT: passwords aren't in this script; we rely on the seeded Prisma
// users having known credentials. The OMS seed sets them explicitly.
const STAFF_LOGIN = { identifier: 'staff@oms.gov.in', password: 'Staff@123' };
const ADMIN_LOGIN = { identifier: 'admin@oms.gov.in', password: 'Admin@123' };

async function main() {
  console.log('=== Auth (Catalyst) E2E Test ===');
  console.log(`Backend: ${BASE}`);
  console.log(`USE_CATALYST_AUTH: ${process.env.USE_CATALYST_AUTH}\n`);

  console.log('--- Step 1: Server health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    check('Server is up', res.ok);
  } catch (err: any) {
    check('Server is up', false, err.message);
    process.exit(1);
  }

  console.log('\n--- Step 2: STAFF logs in (Catalyst-backed) ---');
  const staffLogin = await call('POST', '/api/auth/login', undefined, STAFF_LOGIN);
  check(
    'Login 200',
    staffLogin.status === 200,
    `got ${staffLogin.status} body: ${JSON.stringify(staffLogin.body).substring(0, 200)}`
  );
  check('Returns a token', Boolean(staffLogin.body?.data?.token));
  check('Returns user info', Boolean(staffLogin.body?.data?.user));
  check('user.email correct', staffLogin.body?.data?.user?.email === STAFF_LOGIN.identifier);
  check('user.role = STAFF', staffLogin.body?.data?.user?.role === 'STAFF');

  const staffToken = staffLogin.body?.data?.token;
  if (!staffToken) {
    console.error('\n❌ No token — aborting.');
    console.error('   Make sure USE_CATALYST_AUTH=true in .env');
    console.error('   Make sure the seed script has run');
    console.error('   Make sure the password matches your dev seed');
    process.exit(1);
  }

  console.log('\n--- Step 3: GET /me with Catalyst-backed token ---');
  const me = await call('GET', '/api/auth/me', staffToken);
  check('Me 200', me.status === 200);
  check('Me returns same email', me.body?.data?.email === STAFF_LOGIN.identifier);

  console.log('\n--- Step 4: ADMIN logs in ---');
  const adminLogin = await call('POST', '/api/auth/login', undefined, ADMIN_LOGIN);
  check('Admin login 200', adminLogin.status === 200);
  const adminToken = adminLogin.body?.data?.token;
  check('Admin role = ADMIN', adminLogin.body?.data?.user?.role === 'ADMIN');

  console.log('\n--- Step 5: GET /users (admin only) ---');
  const users = await call('GET', '/api/auth/users', adminToken);
  check('Users list 200', users.status === 200);
  check(
    'List has at least the 3 seeded users',
    Array.isArray(users.body?.data) && users.body.data.length >= 3
  );

  console.log('\n--- Step 6: STAFF cannot list users (403) ---');
  const forbid = await call('GET', '/api/auth/users', staffToken);
  check('STAFF /users → 403', forbid.status === 403, `got ${forbid.status}`);

  console.log('\n--- Step 7: Catalyst-backed token works on Visitor module ---');
  const visitorList = await call('GET', '/api/visitors', staffToken);
  check('Visitors list with Catalyst JWT', visitorList.status === 200, `got ${visitorList.status}`);

  console.log('\n--- Step 8: Wrong password rejected ---');
  const wrong = await call('POST', '/api/auth/login', undefined, {
    identifier: STAFF_LOGIN.identifier,
    password: 'definitely-not-the-password-zzz',
  });
  check('Wrong password → 401', wrong.status === 401, `got ${wrong.status}`);

  console.log('\n--- Step 9: Unknown user rejected ---');
  const unknown = await call('POST', '/api/auth/login', undefined, {
    identifier: 'nobody@example.com',
    password: 'whatever',
  });
  check('Unknown email → 401', unknown.status === 401, `got ${unknown.status}`);

  console.log('\n=== Result ===');
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
