// Public YouTube / YouTube Music playlist → [{id, title, artist}]. No key needed:
// tries, in order: YOUTUBE_API_KEY (official, if set) → YouTube's web-client endpoint → the playlist page → RSS (newest 15).
const txt = t => t && (t.simpleText || (t.runs || []).map(r => r.text).join('')) || '';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
function fromPage(html) {
  const m = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  return m ? [...collect(JSON.parse(m[1])).values()].filter(v => v.title) : [];
}
const collect = (root, out = new Map()) => {   // any video renderer shape, anywhere in the JSON
  const walk = o => { if (!o || typeof o != 'object') return;
    if (typeof o.videoId == 'string' && o.title && !out.has(o.videoId)) out.set(o.videoId, {id: o.videoId, title: txt(o.title), channel: txt(o.shortBylineText || o.longBylineText || o.ownerText)});
    for (const k in o) walk(o[k]); };
  walk(root); return out;
};
const token = o => { if (!o || typeof o != 'object') return null; if (o.continuationCommand?.token) return o.continuationCommand.token;
  for (const k in o) { const t = token(o[k]); if (t) return t; } return null; };
// YouTube's own web-client endpoint: no key, and it pages through the whole playlist
async function fromInnertube(id) {
  const ctx = {client: {clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'en', gl: 'US'}}, out = new Map();
  let body = {context: ctx, browseId: 'VL' + id};
  for (let n = 0; n < 6 && body; n++) {   // ponytail: ~600 tracks max
    const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {method: 'POST', headers: {'Content-Type': 'application/json', 'User-Agent': UA}, body: JSON.stringify(body)});
    if (!r.ok) break;
    const j = await r.json(), before = out.size; collect(j, out);
    const t = out.size > before && token(j); body = t ? {context: ctx, continuation: t} : null;
  }
  return [...out.values()].filter(v => v.title && !/^(private|deleted) video$/i.test(v.title));
}
// last resort: the public RSS feed (newest 15 only)
async function fromRss(id) {
  const x = await (await fetch('https://www.youtube.com/feeds/videos.xml?playlist_id=' + id, {headers: {'User-Agent': UA}})).text();
  const un = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return [...x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({id: (e.match(/<yt:videoId>(.*?)</) || [])[1], title: un((e.match(/<title>(.*?)<\/title>/) || [])[1] || ''), channel: un((e.match(/<name>(.*?)<\/name>/) || [])[1] || '')})).filter(v => v.id && v.title);
}
async function fromApi(id, key) {
  const out = []; let page = '';
  do {   // ponytail: capped at 10 pages (500 tracks)
    const j = await (await fetch('https://www.googleapis.com/youtube/v3/playlistItems?' + new URLSearchParams({part: 'snippet', maxResults: 50, playlistId: id, key, pageToken: page}))).json();
    if (j.error) throw Error(j.error.message);
    for (const x of j.items) if (x.snippet.resourceId?.videoId && !/^(private|deleted) video$/i.test(x.snippet.title)) out.push({id: x.snippet.resourceId.videoId, title: x.snippet.title, channel: x.snippet.videoOwnerChannelTitle || ''});
    page = j.nextPageToken;
  } while (page && out.length < 500);
  return out;
}
const JUNK = /\((?:official|lyric|audio|visuali[sz]er|music video|video|hd|4k|full)[^)]*\)|\[[^\]]*\]|\b(?:official\s+)?(?:music\s+)?video\b|\blyric(?:al|s)?\b|\bhd\b|\b4k\b|\bremaster(?:ed)?\b|\bjukebox\b|\b(?:(?:super\s?hit|evergreen|classic|romantic|old|hindi|bollywood|full|video|lyrical|audio|best|popular|hit)\s+)+songs?\b/gi;   // promo words, and descriptor phrases like “Superhit Classic Hindi Song” — never a lone “song”
const split = v => {
  const topic = / - Topic$/.test(v.channel), ch = v.channel.replace(/ - Topic$/, '').trim();
  let segs = v.title.replace(JUNK, ' ').split(/\s*[|｜]\s*|\s+[-–—]\s+|\s*:\s+/).map(s => s.replace(/\s+/g, ' ').replace(/^[\s,&.-]+|[\s,&.-]+$/g, '').trim()).filter(s => s.length > 1);
  if (!segs.length) segs = [v.title.trim()];
  // YouTube Music "Artist - Topic" channels name the artist; otherwise the pieces order varies, so search with several and let the catalogue decide
  const qs = topic ? [`${ch} ${segs[0]}`, segs[0]] : [...new Set([segs.slice(0, 2).join(' '), segs[0], ch && ch != segs[0] && `${ch} ${segs[0]}`].filter(Boolean))];
  return {id: v.id, title: segs[0], artist: topic ? ch : segs[1] || ch, qs};
};
// all the ways, in order; returns {vids, used, tried}
async function ytList(id) {
  const key = process.env.YOUTUBE_API_KEY, tried = [];
  const ways = [key && ['api', () => fromApi(id, key)], ['web', () => fromInnertube(id)],
    ['page', async () => fromPage(await (await fetch('https://www.youtube.com/playlist?list=' + id, {headers: {'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': UA, Cookie: 'CONSENT=YES+1'}})).text())],
    ['rss', () => fromRss(id)]].filter(Boolean);
  for (const [name, fn] of ways) {
    try { const vids = await fn(); tried.push(name + ': ' + vids.length); if (vids.length) return {vids: vids.map(split), used: name, tried}; }
    catch (e) { tried.push(name + ': ' + e.message); }
  }
  return {vids: [], used: '', tried};
}
module.exports = async (req, res) => {
  const id = String(req.query.list || '');
  if (!/^[\w-]{10,64}$/.test(id)) return res.status(400).json({error: 'not a playlist id'});
  const {vids, used, tried} = await ytList(id);
  if (!vids.length) return res.status(404).json({error: 'YouTube returned no tracks — is the playlist public (not private)?', tried});
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.json({items: vids, source: used, partial: used == 'rss'});
};
module.exports.fromPage = fromPage;
module.exports.ytList = ytList;
