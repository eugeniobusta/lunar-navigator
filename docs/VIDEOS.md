# Videos

Cut with ffmpeg by `scripts/make_videos.py` from screen recordings; no app code is involved. All three are
1920 x 1080, H.264, 30 frames per second, and **have no audio track**.

| File | Length | For | What is in it |
|------|--------|-----|---------------|
| `media/submission-30s.mp4` | 29.0 s | the Space Apps form (limit 30 s) | 15 s of website (homepage, Site Finder, Window Finder), then 14 s of the real VR session (the whole Moon, flying to the pole, the coloured ground, landing, standing on the surface), with burned-in English subtitles |
| `media/pitch-3min.mp4` | 3:00 | the live pitch; the team speaks over it | docs/PITCH.md section by section, a small section label in the corner, a QR code to the live site over the last 5 seconds |
| `media/pitch-2min.mp4` | 2:00 | the same, shorter | the same story and the same QR ending |

The mp4 files and the VR source are **not in the repository** (`.gitignore`: together they are about 280 MB, and
the VR source alone is over GitHub's 100 MB limit for one file). They are in `media/` on the lead's laptop.

## Sources

- `media/clips/01-home.webm` to `07-compare-sites.webm` and `11-im2-athena.webm`, `12-battery.webm`,
  `13-how-we-checked.webm`: the website, recorded by `scripts/record_footage.mjs` from the production build.
- `media/vr-demo-50s.mp4`: a recording of a real VR session, copied from the lead's `~/Downloads/full50secDEMO.mp4`.
  Despite its name it is 61 s long. It has an audio track, which is silent (-91 dB), so there is no narrator in it.

## The pitch videos, section by section

docs/PITCH.md gives a time only for the hook (30 s); the other lengths were chosen here to fill 3:00 and 2:00.

| Section of docs/PITCH.md | Label on screen | 3:00 | 2:00 | Footage |
|--------------------------|-----------------|------|------|---------|
| 1 Hook | Why it matters | 0:00 to 0:30 | 0:00 to 0:20 | homepage; the whole Moon in VR; IM-2 Athena's landing spot in Site Finder (it passes every limit on the 120 m map) |
| 2 Problem | The problem | 0:30 to 0:55 | 0:20 to 0:35 | Explore a site and Overview: the Sun and Earth against the real skyline |
| 3 Live demo | Live demo | 0:55 to 2:00 | 0:35 to 1:20 | Site Finder, Plan a landing, Compare sites with the launch slip, Window Finder, the VR flight to the pole and the landing |
| 4 Survival | Surviving the night | 2:00 to 2:20 | 1:20 to 1:33 | Battery (runs out, then survives with a bigger battery); the surface in VR |
| 5 Validation | How we checked | 2:20 to 2:40 | 1:33 to 1:45 | How it works: our numbers against JPL Horizons and NASA's PGDA maps |
| 6 Close | Who it is for, and what is next | 2:40 to 3:00 | 1:45 to 2:00 | the VR; then the homepage with the QR code for the last 5 seconds |

Where a clip is shorter or longer than its slot it is slowed down or sped up (the VR flight to the pole plays two
to three times faster); nothing is looped. There is no clip for the Chang'e-7 line of the hook or for MoonBox.

## Metadata

`submission-30s.mp4` carries the comment "No narration: this video is silent. Built with AI coding assistants
(Claude Code). The project's VR view has a narrator voice generated with ElevenLabs (AI)." The pitch videos carry
"Silent: the team speaks over it. Built with AI coding assistants (Claude Code)."

## Make them again

    make build && make xr && (cd web && npx vite preview --port 4179 --strictPort) &
    node scripts/record_footage.mjs http://localhost:4179 web      # clips 01 to 07 and web-30s.webm
    node scripts/record_footage.mjs http://localhost:4179 extra    # clips 11 to 13
    uv run --with "qrcode[pil]" python scripts/make_videos.py      # the three mp4 files

Needs ffmpeg, `web/node_modules` (Playwright draws the subtitles, labels and the QR card, because this ffmpeg has
no text filter), and `media/vr-demo-50s.mp4` in place. The QR code was read back from a frame of each pitch video
and decodes to the live site's address.
