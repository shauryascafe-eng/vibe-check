// Finds a 30-second preview for "artist title": Deezer first, iTunes as fallback. Cached at the edge for a day.
const pick = async (q) => {
  try {
    const d = await (await fetch('https://api.deezer.com/search?limit=1&q=' + encodeURIComponent(q))).json();
    const t = d.data && d.data[0];
    if (t && t.preview) return {title: t.title, artist: t.artist.name, preview: t.preview, duration: t.duration, cover: t.album && t.album.cover_medium};
  } catch {}
  try {
    const d = await (await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=1&term=' + encodeURIComponent(q))).json();
    const t = d.results && d.results[0];
    if (t && t.previewUrl) return {title: t.trackName, artist: t.artistName, preview: t.previewUrl, duration: t.trackTimeMillis / 1000, cover: t.artworkUrl100};
  } catch {}
  return null;
};
module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.status(400).json({error: 'missing q'});
  const m = await pick(q);
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return m ? res.json(m) : res.status(404).json({error: 'no preview'});
};
module.exports.pick = pick;
