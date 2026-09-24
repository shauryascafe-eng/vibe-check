// Signs a short-lived Apple Music developer token (ES256 JWT). Set in Vercel → Settings → Environment Variables:
// APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (contents of the .p8 file). The private key never reaches the browser.
const crypto = require('crypto');
module.exports = (req, res) => {
  const {APPLE_TEAM_ID: iss, APPLE_KEY_ID: kid, APPLE_PRIVATE_KEY: key} = process.env;
  if (!iss || !kid || !key) return res.status(503).send('Apple Music not configured');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const data = `${b64({alg: 'ES256', kid})}.${b64({iss, iat: now, exp: now + 12 * 3600})}`;
  const sig = crypto.sign('sha256', Buffer.from(data), {key: key.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363'}).toString('base64url');
  res.setHeader('Cache-Control', 's-maxage=3600');
  res.send(`${data}.${sig}`);
};
