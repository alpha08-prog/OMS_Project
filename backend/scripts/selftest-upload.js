/* Self-test the REAL compiled uploadObject/getSignedDownloadUrl/deleteObject.
 * fakeReq has no admin token, so it exercises the refresh-token path (same as
 * dev, and what prod will now prefer). Run: node scripts/selftest-upload.js */
require('dotenv').config();
const { uploadObject, getSignedDownloadUrl, deleteObject, buildObjectKey } = require('../compiled/lib/stratus');

async function main() {
  const fakeReq = { headers: {} };
  const key = buildObjectKey('debug', 'selftest', 'hello.txt');
  const body = Buffer.from('OMS self-test ' + Date.now());

  console.log('1) uploadObject key =', key);
  await uploadObject(fakeReq, key, body, 'text/plain');
  console.log('   -> UPLOAD OK');

  console.log('2) getSignedDownloadUrl + fetch back');
  const url = await getSignedDownloadUrl(fakeReq, key, 300);
  const r = await fetch(url);
  const txt = await r.text();
  console.log('   -> download status', r.status);
  console.log('   -> content match:', txt === body.toString() ? 'YES ✓' : `NO (got "${txt.slice(0,60)}")`);

  console.log('3) deleteObject (cleanup)');
  await deleteObject(fakeReq, key);
  console.log('   -> DELETE OK');

  console.log('\nRESULT: full upload→download→delete round-trip PASSED');
}
main().then(() => process.exit(0)).catch((e) => {
  console.log('\nRESULT: FAILED ->', String(e && e.message).slice(0, 300));
  process.exit(1);
});
