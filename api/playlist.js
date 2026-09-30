// One link box for every free source. GET /api/playlist?url=<playlist / album / profile link>
// → {service, name, items:[{title, artist, dur?, preview?, sp?, isrc?}], partial?}
// Only these hosts are fetched (plus their short-link redirectors), so the endpoint can't be pointed anywhere else.
const {ytList} = require('./yt.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const HOSTS = /(^|\.)(youtube\.com|youtu\.be|deezer\.com|deezer\.page\.link|spotify\.com|spotify\.link|apple\.com|soundcloud\.com|bandcamp\.com|jiosaavn\.com|last\.fm)$/;
const SHORT = /^(link\.deezer\.com|deezer\.page\.link|spotify\.link|on\.soundcloud\.com|youtu\.be)$/;
const get = async (u, o = {}) => { const r = await fetch(u, {redirect: 'follow', ...o, headers: {'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(o.headers || {})}}); if (!r.ok) throw Error(`${new URL(u).host} ${r.status}`); return r; };
const html = u => get(u).then(r => r.text());
const json = (u, o) => get(u, o).then(r => r.json());
const unent = s => String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const walk = (o, fn) => { if (!o || typeof o != 'object') return; fn(o); for (const k in o) walk(o[k], fn); };
const scriptJSON = (h, re, attr) => { const m = h.match(re); return m ? JSON.parse(attr ? unent(m[1]) : m[1]) : null; };

const P = {
  async youtube(u) {
    const id = u.searchParams.get('list'); if (!id) throw Error('YouTube link needs list=… (a playlist, not a single video)');
    const {vids, used, tried} = await ytList(id);
    if (!vids.length) throw Error('no tracks [' + tried.join(' · ') + ']');
    return {name: 'YouTube playlist', items: vids.map(v => ({title: v.title, artist: v.artist, qs: v.qs, src: 'youtube', id: v.id})), partial: used == 'rss'};
  },
  // free public API, no key; its tracks carry their own 30-s preview
  async deezer(u) {
    const [, kind, id] = u.pathname.match(/\/(playlist|album)\/(\d+)/) || []; if (!id) throw Error('Deezer link must be a playlist or album');
    const meta = await json(`https://api.deezer.com/${kind}/${id}`); if (meta.error) throw Error(meta.error.message);
    const items = [];
    for (let next = `https://api.deezer.com/${kind}/${id}/tracks?limit=100`; next && items.length < 1000;) {
      const j = await json(next); if (j.error) throw Error(j.error.message);
      for (const t of j.data) items.push({title: t.title, artist: t.artist?.name || meta.artist?.name || '', dur: t.duration, preview: t.preview || undefined});
      next = j.next;
    }
    return {name: meta.title, items};
  },
  // the public embed page carries the track list; Spotify ids also unlock catalogue data (ReccoBeats)
  async spotify(u) {
    const [, kind, id] = u.pathname.match(/\/(playlist|album)\/([A-Za-z0-9]{22})/) || []; if (!id) throw Error('Spotify link must be a playlist or album');
    const d = scriptJSON(await html(`https://open.spotify.com/embed/${kind}/${id}`), /<script id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s);
    let ent; walk(d, o => { if (!ent && Array.isArray(o.trackList)) ent = o; });
    if (!ent) throw Error('Spotify page had no track list');
    return {name: ent.name || ent.title || 'Spotify ' + kind, items: ent.trackList.map(t => ({title: t.title, artist: String(t.subtitle || '').split(/,\s*/)[0], dur: t.duration ? t.duration / 1000 : undefined, sp: t.uri, preview: t.audioPreview?.url}))};
    // ponytail: the embed lists up to ~100 tracks; longer playlists need Spotify's API (Premium dev app)
  },
  // albums through Apple's public lookup API; playlists from the page's own data
  async apple(u) {
    const alb = u.pathname.match(/\/album\/(?:[^/]+\/)?(\d+)/);
    if (alb) {
      const j = await json(`https://itunes.apple.com/lookup?id=${alb[1]}&entity=song&limit=200`);
      const songs = j.results.filter(r => r.wrapperType == 'track');
      return {name: j.results[0]?.collectionName || 'Apple Music album', items: songs.map(t => ({title: t.trackName, artist: t.artistName, dur: t.trackTimeMillis / 1000, preview: t.previewUrl}))};
    }
    if (!/\/playlist\//.test(u.pathname)) throw Error('Apple Music link must be a playlist or album');
    const h = await html(u.href), items = [], seen = new Set();
    const d = scriptJSON(h, /<script[^>]*id="serialized-server-data"[^>]*>(.+?)<\/script>/s);
    walk(d, o => { const a = o.artistName || o.subtitleLinks?.[0]?.title; if (typeof o.title == 'string' && typeof a == 'string' && (o.duration || o.contentDescriptor?.kind == 'song') && !seen.has(o.title + a)) { seen.add(o.title + a); items.push({title: o.title, artist: a, dur: o.duration ? o.duration / 1000 : undefined}); } });
    if (!items.length) {   // fallback: schema.org data in the page
      for (const m of h.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/gs)) walk(JSON.parse(m[1]), o => { if (o['@type'] == 'MusicRecording' && o.name) items.push({title: unent(o.name), artist: unent(o.byArtist?.name || o.byArtist?.[0]?.name || '')}); });
    }
    return {name: unent((h.match(/<title>(.*?)<\/title>/) || [])[1] || 'Apple Music playlist').replace(/ - Apple Music$/, ''), items};
  },
  // SoundCloud's own web client: page data, then its public track endpoint for the rest
  async soundcloud(u) {
    const h = await html(u.href), d = scriptJSON(h, /window\.__sc_hydration\s*=\s*(\[.+?\]);<\/script>/s);
    const pl = d?.find(x => x.hydratable == 'playlist')?.data; if (!pl) throw Error('SoundCloud link must be a public playlist, set or album');
    const full = pl.tracks.filter(t => t.title), missing = pl.tracks.filter(t => !t.title).map(t => t.id);
    let partial = false;
    if (missing.length) try {
      let cid;
      for (const src of [...h.matchAll(/<script crossorigin src="([^"]+\.js)"/g)].map(m => m[1]).reverse()) { cid = ((await html(src)).match(/client_id\s*:\s*"(\w{32})"/) || [])[1]; if (cid) break; }
      if (!cid) throw Error('no client id');
      for (let i = 0; i < missing.length; i += 50) full.push(...await json(`https://api-v2.soundcloud.com/tracks?ids=${missing.slice(i, i + 50).join(',')}&client_id=${cid}`));
    } catch { partial = true; }
    const order = new Map(pl.tracks.map((t, i) => [t.id, i]));
    full.sort((a, b) => order.get(a.id) - order.get(b.id));
    return {name: pl.title, partial, items: full.map(t => {   // "Artist - Title" in the title beats the uploader's name
      const [a, ti] = t.title.includes(' - ') ? t.title.split(' - ', 2) : [t.publisher_metadata?.artist || t.user?.username || '', t.title];
      return {title: ti.trim(), artist: a.trim(), dur: t.duration / 1000, isrc: t.publisher_metadata?.isrc};
    })};
  },
  async bandcamp(u) {
    const h = await html(u.href), d = scriptJSON(h, /data-tralbum="([^"]+)"/, true); if (!d?.trackinfo) throw Error('Bandcamp link must be an album or track page');
    return {name: d.current?.title || 'Bandcamp', items: d.trackinfo.map(t => ({title: t.title, artist: t.artist || d.artist || '', dur: t.duration}))};
  },
  // India's biggest free service; its web API answers by the token at the end of the link
  async jiosaavn(u) {
    const token = u.pathname.split('/').filter(Boolean).pop(), kind = /\/album\//.test(u.pathname) ? 'album' : /\/song\//.test(u.pathname) ? 'song' : 'playlist', items = [];
    let name = 'JioSaavn ' + kind;
    for (let p = 1; p <= 20; p++) {
      const j = await json(`https://www.jiosaavn.com/api.php?__call=webapi.get&token=${encodeURIComponent(token)}&type=${kind}&p=${p}&n=50&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`);
      const list = j.list || j.songs || (kind == 'song' ? Object.values(j) : []); name = unent(j.title || name);
      for (const t of list) if (t?.title) items.push({title: unent(t.title), artist: unent(t.more_info?.artistMap?.primary_artists?.[0]?.name || t.primary_artists || t.subtitle?.split(' - ')[0] || ''), dur: +t.more_info?.duration || undefined});
      if (kind != 'playlist' || list.length < 50) break;
    }
    return {name, items};
  },
  // a person's loved tracks (else their top tracks) — needs a free LASTFM_API_KEY
  async lastfm(u) {
    const user = (u.pathname.match(/\/user\/([^/]+)/) || [])[1]; if (!user) throw Error('Last.fm link must be a profile: last.fm/user/NAME');
    const key = process.env.LASTFM_API_KEY; if (!key) throw Error('the site owner needs to add LASTFM_API_KEY');
    const call = m => json(`https://ws.audioscrobbler.com/2.0/?method=${m}&user=${encodeURIComponent(user)}&limit=300&api_key=${key}&format=json`);
    let t = (await call('user.getlovedtracks')).lovedtracks?.track || [];
    if (!t.length) t = (await call('user.gettoptracks')).toptracks?.track || [];
    return {name: `${decodeURIComponent(user)} on Last.fm`, items: t.map(x => ({title: x.name, artist: x.artist?.name || x.artist?.['#text'] || ''}))};
  },
};
const which = h => /youtube|youtu\.be/.test(h) ? 'youtube' : /deezer/.test(h) ? 'deezer' : /spotify/.test(h) ? 'spotify' : /apple\.com/.test(h) ? 'apple'
  : /soundcloud/.test(h) ? 'soundcloud' : /bandcamp/.test(h) ? 'bandcamp' : /jiosaavn/.test(h) ? 'jiosaavn' : /last\.fm/.test(h) ? 'lastfm' : null;

async function resolve(raw) {
  let u = new URL(/^https?:\/\//.test(raw) ? raw : 'https://' + raw);
  if (u.protocol != 'https:' && u.protocol != 'http:' || !HOSTS.test(u.hostname)) throw Error('unsupported link');
  if (SHORT.test(u.hostname)) { u = new URL((await get(u.href)).url); if (!HOSTS.test(u.hostname)) throw Error('short link went somewhere unexpected'); }
  return u;
}
module.exports = async (req, res) => {
  try {
    const u = await resolve(String(req.query.url || '').trim().slice(0, 500)), svc = which(u.hostname);
    if (!svc) return res.status(400).json({error: 'Paste a playlist link from YouTube, Deezer, Spotify, Apple Music, SoundCloud, Bandcamp, JioSaavn or Last.fm'});
    const out = await P[svc](u), items = out.items.filter(t => t.title).slice(0, 1000);
    if (!items.length) return res.status(404).json({error: `${svc}: no tracks found — is it public?`});
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.json({service: svc, name: out.name, partial: !!out.partial, items});
  } catch (e) { res.status(e.message == 'unsupported link' ? 400 : 502).json({error: e.message}); }
};
module.exports.P = P; module.exports.resolve = resolve;
