# Home page clips and pictures

Everything the home page's Featured tools, camera gallery, video pop-out and every-tool grid show comes from here. The
page reads `src/pages/home/clips.json` (made by `manifest.mjs`), `public/clips/home/*` and `public/shots/*`.

| File | What it does |
| --- | --- |
| `source/lines.json` | The voiceover lines of each clip, as Glenn reads them (`[confident]` style tags, "Grid Iron Vault" so the voice says it right). |
| `source/headlines.json` | The clip's title and one short on-screen title per line. |
| `source/timings.json` | When each line starts and ends in Glenn's take (seconds). Footage is padded to the next line's start. |
| `rec/lib.mjs` | The recorder. Drives the real app with Playwright over sample data, with the clock stepped one frame at a time (30 fps, 1440x810 at 2x) so the footage is smooth on a slow machine. |
| `rec/<clip>.mjs` | One script per clip: `setup(h)` (untimed) and one scene per voiceover line. |
| `compose.py` | Captions bar, Glenn's take over one of the eight kept music beds, loudness, 1280x720 H.264 + AAC. |
| `pack-finished.py` | Packs the clips that were already finished videos (the Designer v2 social set) into the same files. |
| `manifest.mjs` | Writes `src/pages/home/clips.json` from what is in `public/clips/home/`. A clip with no `.mp4` is left out (and so is its tool on the page). |
| `shots.mjs` | Takes the screen pictures `public/shots/<name>.webp` for the every-tool grid (names in `SHOT_OF_ROUTE`, `src/pages/home/tools.ts`). |
| `rec/*-mocks.mjs`, `rec/08-whiteboard.py`, `rec/13-my-team-assets.py`, `rec/15-lib.mjs` | Helpers for single clips: the mocked `/api` answers Griddy, Upload and the player links need (the exact shapes the real server returns), the sample whiteboard photo, the sample roster CSV and logo, and a taller recorder for the 3D Film Room (its 1440x868 screen keeps the whole 3D picture above the caption bar). |
| `rec/15-camera-stills.mjs` | Takes `public/shots/cameras/<id>.webp`, the Film Room in 3D through each of its twelve cameras. |

## Running them

Record against a frozen copy of the build, so a rebuild never pulls files out from under a recording:

```bash
npm run build
cp -r dist /tmp/frozen && npx vite preview --outDir /tmp/frozen --port 4174 --strictPort &
BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/<clip>.mjs
BASE=http://localhost:4174 python3 scripts/home-clips/compose.py <clip>   # footage + narrator + music into public/clips/home/<clip>.mp4
node scripts/home-clips/manifest.mjs                   # clips.json
BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/shots.mjs
```

`compose.py` reads Glenn's takes from `VOICE_DIR` (default `/mnt/project-files/launch/site/home-refresh-2026-11-22/voice`, one `<clip>.mp3` each),
the music from `BEDS` (default `/mnt/project-files/launch/social/music-beds-2026-11-21`) and the frames from `FRAMES`
(default `/tmp/home-clips/frames`). `pack-finished.py <clip> <source.mp4>` packs an already finished video instead of recording one.

`DRY=1` steps the clock and runs every scene but writes no frames, which is a quick way to check the scenes fit their
lines (the recorder prints any scene that runs past the next line's start).

## Rules

- Voice: Glenn only (ElevenLabs), rendered once and split into lines, never pitch-shifted. Don't call a generation twice to retry.
- Music: only the eight kept beds. Never the ones in `passed/`.
- No free-trial claims, no other company's name or look, no NFL footage or a real player's likeness.
- Re-record the clips and pictures after a big layout change, then run `manifest.mjs`.
