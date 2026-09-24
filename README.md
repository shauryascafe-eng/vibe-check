# Vibe Check

Open `index.html` in Chrome (or the deployed URL). Everything runs in the browser (Essentia.js); audio never leaves your Mac.

1. **Load tapes** — drop files or whole folders (or use Add files / Add folder). Bulk analysed; library is remembered in the browser.
2. **Taste console** — target + weight per feature; ≈ on a track = "more like this"; Harmonic lock = Camelot-compatible only.
3. **Arrange** — Taste match · Mix path (key-compatible, small BPM jumps, energy curve) · Sorted (click a column) · Custom (drag rows).
4. **Export** — CSV, or .m3u playlist in the arranged order.

Features: Key, Camelot, BPM, Duration, Danceability, Energy, Happiness, Acousticness, Instrumental (AI models by MTG/Essentia, CC BY-NC-ND — non-commercial), Loudness, Brightness, Busyness, Dynamics.

`analyze.py`, `run.sh`, `setup.sh`, `venv/`, `tracks.js` are the old Python path — no longer needed; safe to trash.

## Streaming setup (one time)

Fill the `CONFIG` block near the bottom of `index.html`, then redeploy.

- **Spotify** (Premium needed for playback): developer.spotify.com → Create app → Web API + Web Playback SDK →
  Redirect URIs: `https://vibe.wasteyourtime.in/` (and your vercel.app URL) → copy Client ID into `spotifyClientId`.
  Dev mode allows 5 users; add them under User Management.
- **YouTube**: console.cloud.google.com → enable *YouTube Data API v3* → Credentials → API key →
  restrict to HTTP referrer `vibe.wasteyourtime.in/*` → paste into `youtubeApiKey`. Public/unlisted playlists only.
- **Apple Music** (Apple Developer Program): Certificates, IDs & Profiles → Keys → new key with MusicKit → download `.p8`.
  Vercel → vibe-check → Settings → Environment Variables: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (paste .p8 contents).

Streaming audio is DRM-protected, so analysis numbers show only for tracks matched to files you analysed locally.
