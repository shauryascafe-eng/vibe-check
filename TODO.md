# Vibe Check · TODO

## Keys (streaming goes live after these)
- [ ] **Spotify** — developer.spotify.com → Create app (Web API + Web Playback SDK)
  - [ ] Redirect URIs: `https://vibe.wasteyourtime.in/` + the vercel.app URL
  - [ ] Paste Client ID into `CONFIG.spotifyClientId` in `index.html`
  - [ ] Add up to 5 listeners under User Management (dev-mode limit)
- [ ] **YouTube** — Google Cloud → enable YouTube Data API v3 → API key
  - [ ] Restrict key to HTTP referrer `vibe.wasteyourtime.in/*`
  - [ ] Paste into `CONFIG.youtubeApiKey`
- [ ] **Apple Music** — Apple Developer Program ($99/yr) → Keys → MusicKit key (.p8)
  - [ ] Vercel env vars: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- [ ] Redeploy: `git commit -am "Add keys" && git push && npx vercel --prod --yes`

## Hosting
- [ ] Hostinger DNS: CNAME `vibe` → `5f6dad439e44bab3.vercel-dns-017.com`
- [ ] Check: `npx vercel domains verify vibe.wasteyourtime.in`
- [ ] Vercel → vibe-check → Deployment Protection → Vercel Authentication: Disabled
- [ ] Connect GitHub repo in Vercel (Settings → Git) so push = deploy

## Test once live
- [ ] Analyse `~/Music/Music` on the live site
- [ ] Spotify: connect, play, save Arrange order as playlist
- [ ] Apple Music: connect, play, save playlist
- [ ] YouTube: load a public playlist, play

## Done
- [x] Read keys from file tags (Mixed In Key / Traktor / Rekordbox)
- [x] Traktor / Rekordbox .m3u8 export (set base folder in Arrange)
- [x] Background analysis (Web Workers, 2 at once)
- [x] Genre/mood tags + tag filter
- [x] Waveform with intro / breakdowns / outro
- [x] Energy & BPM set charts
- [x] Duplicate finder

## Next
- [ ] Add Downloads/playmate folders via "+" → benchmark key finder vs Mixed In Key (184 tracks) + calibrate Energy vs MIK 1–10

## Later / ideas
- [ ] Private YouTube playlists (Liked Music) — needs Google OAuth
- [ ] Liveness & Speechiness — no public model yet
- [ ] Trash old Python files (`analyze.py`, `run.sh`, `setup.sh`, `venv/`, `tracks.js`, `results.csv`, `.gitignore.bak`)
