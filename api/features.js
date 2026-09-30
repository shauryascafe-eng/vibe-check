// Automatic track data from streaming catalogues.
// POST {items:[{sp, isrc, title, artist}]} → {features:[{sp, key, mode, tempo, energy, ...} | null]} in the same order.
// Spotify track id → ReccoBeats (free, Spotify-style audio features incl. key/mode/tempo).
// No Spotify id → found via Spotify search (ISRC, else title+artist) when SPOTIFY_CLIENT_ID/SECRET are set.
const RB = 'https://api.reccobeats.com/v1/audio-features?ids=';
let tok = null;
async function spToken() {
  const {SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: sec} = process.env;
  if (!id || !sec) return null;
  if (tok && tok.exp > Date.now()) return tok.a;
  const r = await fetch('https://accounts.spotify.com/api/token', {method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(id + ':' + sec).toString('base64')},
    body: 'grant_type=client_credentials'});
  const j = await r.json(); if (!j.access_token) return null;
  tok = {a: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000}; return tok.a;
}
const q = s => String(s || '').replace(/["():]/g, ' ').replace(/\s+/g, ' ').trim();
async function findSp(it, a) {
  const tries = [it.isrc && `isrc:${q(it.isrc)}`, it.title && it.artist && `track:${q(it.title)} artist:${q(it.artist.split(',')[0])}`, ...(it.qs || [`${it.title} ${it.artist}`]).map(q)].filter(Boolean);
  for (const s of tries.slice(0, 3)) {
    const r = await fetch('https://api.spotify.com/v1/search?type=track&limit=1&q=' + encodeURIComponent(s), {headers: {Authorization: 'Bearer ' + a}});
    if (r.ok) { const t = (await r.json()).tracks?.items?.[0]; if (t) return {id: t.id, name: t.name, artist: t.artists?.[0]?.name}; }
  }
  return null;
}
async function rb(ids) {
  const out = new Map();
  // ponytail: batch size isn't published; 20 per call, one retry on 429
  for (let i = 0; i < ids.length; i += 20) {
    const u = RB + ids.slice(i, i + 20).join(',');
    let r = await fetch(u); if (r.status == 429) { await new Promise(ok => setTimeout(ok, 1200)); r = await fetch(u); }
    if (!r.ok) continue;
    for (const f of (await r.json()).content || []) { const id = (f.href || '').split('/track/')[1]; if (id) out.set(id, f); }
  }
  return out;
}
const spId = s => (String(s || '').match(/(?:track[:/])?([A-Za-z0-9]{22})$/) || [])[1] || null;

async function features(items) {
  const ids = items.map(it => spId(it.sp)), names = [], need = ids.map((x, i) => x ? -1 : i).filter(i => i >= 0);
  const a = need.length ? await spToken() : null;
  if (a) for (let i = 0; i < need.length; i += 10)   // 10 searches at a time
    await Promise.all(need.slice(i, i + 10).map(async k => { const m = await findSp(items[k], a).catch(() => null); if (m) { ids[k] = m.id; names[k] = m; } }));
  const got = await rb([...new Set(ids.filter(Boolean))]);
  return ids.map((id, i) => { const f = id && got.get(id); return f ? {sp: id, name: names[i]?.name, artist: names[i]?.artist, key: f.key, mode: f.mode, tempo: f.tempo, energy: f.energy, danceability: f.danceability,
    valence: f.valence, acousticness: f.acousticness, instrumentalness: f.instrumentalness, loudness: f.loudness, liveness: f.liveness, speechiness: f.speechiness} : null; });
}

module.exports = async (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (req.method != 'POST' || !Array.isArray(items) || !items.length || items.length > 100) return res.status(400).json({error: 'POST {items:[…]} with 1–100 tracks'});
  try { res.json({features: await features(items.map(it => ({sp: it.sp, isrc: it.isrc, title: String(it.title || '').slice(0, 200), artist: String(it.artist || '').slice(0, 200), qs: Array.isArray(it.qs) ? it.qs.slice(0, 4).map(x => String(x).slice(0, 200)) : undefined})))}); }
  catch (e) { res.status(502).json({error: 'data source unavailable'}); }
};
module.exports.features = features;
module.exports.spId = spId;
