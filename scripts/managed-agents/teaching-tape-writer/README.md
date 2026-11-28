# Teaching tapes (Grid Iron Vault only)

Two stages, kept apart on purpose:

1. **Write** (cheap, cloud): `teaching-tape-writer/` produces `tapes.json` scripts. Pilot is 3 tapes.
2. **Render** (stays in a Claude Code session or on your computer): the existing `scripts/home-clips/` pipeline records the 3D Film Room with Playwright, lays Glenn's voice and a kept music bed under it with `compose.py`. It needs the built app, ffmpeg, Playwright, ElevenLabs credits and the files in `/mnt/project-files`, which a Managed Agent sandbox does not have.

Needs from you: `plays-to-teach.csv` (play, formation, concept, camera, notes) and the Film Room camera names.
Not covered by the Anthropic credits: ElevenLabs voice generation (never retry a generation twice).

## What's here

- `data/plays-to-teach.csv`: 28 pass starters (1-30 minus runs), built from `STARTERS` and `WHY_IT_WORKS`, so the coaching sentences are the app's own.
- `data/cameras.txt`: the twelve Film Room camera names (`FILM_CAMERA_NAME`).
- `pilot/tapes.json`: three scripts (Smash, Flood Right, Mesh) written by hand to the agent's rules and checked against them. Not produced by the Managed Agent; use them to judge the voice before spending anything.

Not yet done: recording or voicing a tape. That needs Glenn's takes (ElevenLabs) and the `scripts/home-clips` pipeline.
