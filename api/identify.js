// "What's this song?" — a few seconds of audio → song details, via AudD (music recognition API).
// POST {audio: <base64>, type: <mime>} → {found, title, artist, album, year, label, genres, cover, links, preview, isrc, spotifyId, timecode}
// Needs AUDD_API_TOKEN in Vercel (free trial at dashboard.audd.io); without it AudD allows only a few test requests.
module.exports = async (req, res) => {
  if (req.method != 'POST') return res.status(405).json({error: 'POST audio'});
  const {audio, type} = req.body || {};
  if (typeof audio != 'string' || audio.length < 1000) return res.status(400).json({error: 'no audio'});
  if (audio.length > 4e6) return res.status(413).json({error: 'clip too long — keep it under ~20 s'});
  try {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(audio, 'base64')], {type: String(type || 'audio/webm')}), 'clip');
    fd.append('return', 'apple_music,spotify,deezer');
    if (process.env.AUDD_API_TOKEN) fd.append('api_token', process.env.AUDD_API_TOKEN);
    const j = await (await fetch('https://api.audd.io/', {method: 'POST', body: fd})).json();
    if (j.status != 'success') return res.status(502).json({error: j.error?.error_message || 'recognition service error', code: j.error?.error_code});
    const r = j.result; if (!r) return res.json({found: false});
    const am = r.apple_music || {}, sp = r.spotify || {}, dz = r.deezer || {};
    res.json({found: true, title: r.title, artist: r.artist, album: r.album, year: (r.release_date || '').slice(0, 4), label: r.label, timecode: r.timecode,
      genres: am.genreNames?.filter(g => g != 'Music') || [], isrc: am.isrc || sp.external_ids?.isrc || dz.isrc, spotifyId: sp.id,
      cover: am.artwork?.url?.replace('{w}', '300').replace('{h}', '300') || sp.album?.images?.[1]?.url || dz.album?.cover_medium,
      preview: dz.preview || am.previews?.[0]?.url || null, dur: dz.duration || (am.durationInMillis ? am.durationInMillis / 1000 : undefined),
      links: {song: r.song_link, spotify: sp.external_urls?.spotify, apple: am.url, deezer: dz.link}});
  } catch (e) { res.status(502).json({error: e.message}); }
};
