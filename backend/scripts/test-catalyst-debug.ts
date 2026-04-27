/**
 * Deep debug — logs every HTTP request the SDK makes, full URL + all headers + body.
 */
import 'dotenv/config';
import https from 'https';

const originalRequest = https.request;
(https as any).request = function (...args: any[]) {
  const opts = args[0];
  if (opts && typeof opts === 'object') {
    const method = opts.method || 'GET';
    const host = opts.hostname || opts.host;
    const path = opts.path || '/';
    console.log(`\n[REQ] ${method} https://${host}${path}`);
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) {
        const val = String(v);
        const display = val.length > 60 ? val.substring(0, 60) + '…' : val;
        console.log(`      ${k}: ${display}`);
      }
    }
  }
  const req = originalRequest.apply(https, args as any);
  // Hook into the response too
  req.on('response', (res: any) => {
    let body = '';
    res.on('data', (chunk: any) => (body += chunk.toString()));
    res.on('end', () => {
      console.log(`[RES] ${res.statusCode} ${res.statusMessage}`);
      if (body.length < 500) console.log(`      Body: ${body}`);
      else console.log(`      Body (first 200): ${body.substring(0, 200)}`);
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
    await app.datastore().table('Visitor').getPagedRows({ maxRows: 5 });
  } catch (err: any) {
    console.error('\n[ERR]:', err.message?.substring(0, 200));
  }

  // Wait for response logs to print
  await new Promise((r) => setTimeout(r, 500));
}

main();
