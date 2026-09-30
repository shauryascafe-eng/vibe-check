// Public YouTube / YouTube Music playlist → [{id, title, artist}]. No key needed:
// uses YOUTUBE_API_KEY (Data API, all items) when set, otherwise reads the public playlist page (first ~100 items).
const txt = t => t && (t.simpleText || (t.runs || []).map(r => r.text).join('')) || '';
function fromPage(html) {
  const m = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s); if (!m) return [];
  const out = new Map(), walk = o => {
    if (!o || typeof o != 'object') return;
    if (typeof o.videoId == 'string' && o.title && !out.has(o.videoId))   // any video renderer shape
      out.set(o.videoId, {id: o.videoId, title: txt(o.title), channel: txt(o.shortBylineText || o.longBylineText || o.ownerText)});
    for (const k in o) walk(o[k]);
  };
  walk(JSON.parse(m[1]));
  return [...out.values()].filter(v => v.title);
}
async function fromApi(id, key) {
  const out = []; let page = '';
  do {   // ponytail: capped at 10 pages (500 tracks)
    const j = await (await fetch('https://www.googleapis.com/youtube/v3/playlistItems?' + new URLSearchParams({part: 'snippet', maxResults: 50, playlistId: id, key, pageToken: page}))).json();
    if (j.error) throw Error(j.error.message);
    for (const x of j.items) if (x.snippet.resourceId?.videoId) out.push({id: x.snippet.resourceId.videoId, title: x.snippet.title, channel: x.snippet.videoOwnerChannelTitle || ''});
    page = j.nextPageToken;
  } while (page && out.length < 500);
  return out;
}
const split = v => {   // "Artist - Title" in the video title, else the channel ("Artist - Topic" on YouTube Music) is the artist
  const [a, t] = v.title.includes(' - ') ? v.title.split(' - ', 2) : [v.channel.replace(/ - Topic$/, ''), v.title];
  return {id: v.id, title: t.trim(), artist: a.trim()};
};
module.exports = async (req, res) => {
  const id = String(req.query.list || '');
  if (!/^[\w-]{10,64}$/.test(id)) return res.status(400).json({error: 'not a playlist id'});
  try {
    const key = process.env.YOUTUBE_API_KEY;
    const vids = key ? await fromApi(id, key)
      : fromPage(await (await fetch('https://www.youtube.com/playlist?list=' + id, {headers: {'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}})).text());
    if (!vids.length) return res.status(404).json({error: 'playlist is empty, private, or YouTube changed its page'});
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.json({items: vids.map(split)});
  } catch (e) { res.status(502).json({error: e.message}); }
};
module.exports.fromPage = fromPage;
