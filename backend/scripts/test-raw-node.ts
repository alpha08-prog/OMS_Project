/**
 * Raw Node.js HTTPS test — bypass the Catalyst SDK entirely.
 * Confirms Node itself can hit the API. Isolates whether the SDK is at fault.
 */
import 'dotenv/config';
import https from 'https';

async function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.CATALYST_CLIENT_ID!,
      client_secret: process.env.CATALYST_CLIENT_SECRET!,
      refresh_token: process.env.CATALYST_REFRESH_TOKEN!,
    });
    const req = https.request({
      hostname: 'accounts.zoho.in',
      path: '/oauth/v2/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c.toString()));
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (j.access_token) resolve(j.access_token);
          else reject(new Error(body));
        } catch {
          reject(new Error(body));
        }
      });
    });
    req.on('error', reject);
    req.end(params.toString());
  });
}

async function getRows(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.catalyst.zoho.in',
      path: '/baas/v1/project/37719000000012085/table/Visitor/row?max_rows=5',
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'X-Catalyst-Environment': 'Development',
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c.toString()));
      res.on('end', () => {
        console.log('[Raw Node] HTTP', res.statusCode);
        console.log('[Raw Node] Body:', body.substring(0, 500));
        resolve(body);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('=== Raw Node HTTPS test (no SDK) ===');
  const token = await getAccessToken();
  console.log('Got access token, length:', token.length);
  await getRows(token);
})();
