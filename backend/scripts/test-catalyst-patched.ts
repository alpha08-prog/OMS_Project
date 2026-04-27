/**
 * Combined: monkey-patch + log every request to confirm patch works.
 */
import 'dotenv/config';
import https from 'https';

const _origReq = https.request;
(https as any).request = function (...args: any[]) {
  const opts = args[0];
  if (opts && typeof opts === 'object' && typeof opts.path === 'string') {
    const before = opts.path;
    opts.path = opts.path.replace(/[?&]next_token=(?=&|$)/g, '').replace(/\?$/, '');
    if (before !== opts.path) {
      console.log(`[PATCH] ${before}  →  ${opts.path}`);
    }
    console.log(`[REQ] ${opts.method || 'GET'} https://${opts.hostname || opts.host}${opts.path}`);
  }
  const req = _origReq.apply(https, args as any);
  req.on('response', (res: any) => {
    let body = '';
    res.on('data', (chunk: any) => (body += chunk.toString()));
    res.on('end', () => {
      const display = body.length > 300 ? body.substring(0, 300) + '…' : body;
      console.log(`[RES] ${res.statusCode} ${display}\n`);
    });
  });
  return req;
};

import catalystSDK from 'zcatalyst-sdk-node';

async function main() {
  const credential = catalystSDK.credential.refreshToken({
    client_id: process.env.CATALYST_CLIENT_ID!,
    client_secret: process.env.CATALYST_CLIENT_SECRET!,
    refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
  });

  const app = catalystSDK.initializeApp({
    project_id: process.env.CATALYST_PROJECT_ID!,
    project_key: process.env.CATALYST_PROJECT_KEY || process.env.CATALYST_PROJECT_ID!,
    project_domain: 'api.catalyst.zoho.in',
    environment: 'Development',
    credential,
  });

  console.log('=== getPagedRows ===');
  try {
    const r = await app.datastore().table('Visitor').getPagedRows({ maxRows: 5 });
    console.log('Result:', JSON.stringify(r).substring(0, 200));
  } catch (err: any) {
    console.error('Error:', err.message?.substring(0, 200));
  }
  await new Promise((r) => setTimeout(r, 500));
}

main();
