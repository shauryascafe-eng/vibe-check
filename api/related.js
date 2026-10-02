// Candidate pool for "Discover": tracks around a seed, from Deezer's free public API (no key).
// GET /api/related?q=<artist title> → {seed, items:[{title, artist, preview, dur, cover}]}
// The pool is deliberately wide (the seed artist's radio + top tracks of related artists);
// Vibe Check then analyses every preview and ranks them by sound, so the catalogue only proposes — the audio decides.
const dz = async p => { const j = await (await fetch('https://api.deezer.com' + p)).json(); if (j.error) throw Error(j.error.message || 'deezer'); return j; };
module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.status(400).json({error: 'missing q'});
  try {
    const seed = (await dz('/search?limit=1&q=' + encodeURIComponent(q))).data?.[0];
    if (!seed) return res.status(404).json({error: 'seed not found on Deezer'});
    const aid = seed.artist.id, out = new Map(), add = t => { if (t?.preview && t.id != seed.id && !out.has(t.id)) out.set(t.id, {title: t.title, artist: t.artist?.name || '', preview: t.preview, dur: t.duration, cover: t.album?.cover_medium}); };
    const [radio, rel] = await Promise.all([dz(`/artist/${aid}/radio?limit=40`).catch(() => ({data: []})), dz(`/artist/${aid}/related?limit=10`).catch(() => ({data: []}))]);
    radio.data.forEach(add);
    const tops = await Promise.all(rel.data.slice(0, 8).map(a => dz(`/artist/${a.id}/top?limit=3`).catch(() => ({data: []}))));
    tops.forEach(t => t.data.forEach(add));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.json({seed: {title: seed.title, artist: seed.artist.name}, items: [...out.values()].slice(0, 60)});
  } catch (e) { res.status(502).json({error: e.message}); }
};
