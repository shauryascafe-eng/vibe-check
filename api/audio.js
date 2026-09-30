// Streams a preview file back same-origin so the browser can decode and analyse it. Only preview CDNs are allowed.
const ALLOW = [/\.dzcdn\.net$/, /^p\.scdn\.co$/, /\.itunes\.apple\.com$/, /\.mzstatic\.com$/, /^audio-ssl\.itunes\.apple\.com$/];
module.exports = async (req, res) => {
  let u; try { u = new URL(String(req.query.u || '')); } catch { return res.status(400).send('bad url'); }
  if (u.protocol != 'https:' || !ALLOW.some(r => r.test(u.hostname))) return res.status(403).send('host not allowed');
  const r = await fetch(u); if (!r.ok) return res.status(502).send('upstream ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 4e6) return res.status(413).send('too large');
  res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
  res.setHeader('Cache-Control', 's-maxage=3600');
  res.send(buf);
};
module.exports.ALLOW = ALLOW;
