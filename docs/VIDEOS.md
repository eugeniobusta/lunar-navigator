# Videos

Cut with ffmpeg by `scripts/make_videos.py` from screen recordings; no app code is involved. All are
1920 x 1080, H.264, 30 frames per second. Only the narrated submission video has sound.

| File | Length | For | What is in it |
|------|--------|-----|---------------|
| `media/submission-30s-voice.mp4` | 29.30 s | **the Space Apps form** (limit 30 s; ours 29.5 s) | 1.2 s of homepage, 9.7 s of Site Finder, then 18.4 s of the real VR session, narrated by three of the VR view's own narrator clips; the spoken words as subtitles; "Narrator voice: AI-generated (ElevenLabs)" in the corner throughout. Details below. Public copy: https://github.com/eugeniobusta/lunar-navigator/releases/tag/submission-video |
| `media/submission-30s.mp4` | 29.0 s | the earlier silent cut, kept as a fallback | 15 s of website (homepage, Site Finder, Window Finder), then 14 s of the real VR session (the whole Moon, flying to the pole, the coloured ground, landing, standing on the surface), with burned-in English subtitles |
| `media/pitch-3min.mp4` | 3:00 | the live pitch; the team speaks over it | docs/PITCH.md section by section, a small section label in the corner, a QR code to the live site over the last 5 seconds |
| `media/pitch-2min.mp4` | 2:00 | the same, shorter | the same story and the same QR ending |

The mp4 files and the VR source are **not in the repository** (`.gitignore`: together they are about 300 MB, and
the VR source alone is over GitHub's 100 MB limit for one file). They are in `media/` on the lead's laptop.

## The narrated submission video

The voice is the VR view's narrator: an AI voice made with ElevenLabs ahead of time (docs/XR.md). This video uses
three of the existing files in `xr/public/voice/`; nothing was generated for it. Each clip is cut only after its
last word, the picture is timed to the words, and the subtitles are the lines of `xr/public/voice/lines.json`
(the script refuses to build if they differ).

| Voice clip | File length | Used | Plays at | On screen |
|------------|-------------|------|----------|-----------|
| (none) | | | 0.00 to 1.20 s | the homepage |
| `colours-on.mp3` | 9.85 s | 9.70 s | 1.20 to 10.90 s | Site Finder: the whole map, then the best zone and a closer look |
| `pole-arrived.mp3` | 8.68 s | 8.40 s | 11.25 to 19.65 s | the VR: down to the pole, its six sites marked |
| `play-first-sunrise.mp3` | 9.10 s | 8.97 s | 20.05 to 29.02 s | the VR: the flight to Malapert Massif, the lander on the surface, long shadows |

Measured on the finished file: 29.30 s (video stream 29.30 s, audio stream 29.27 s); voice from 1.24 to 10.81 s,
11.30 to 19.56 s and 20.05 to 28.96 s, so the clips do not overlap; loudness -15.9 LUFS; audio AAC, 48 kHz, 192
kbit/s; the index is at the front of the file (faststart). Metadata comment: "Narrator voice generated with
ElevenLabs (AI). Built with AI coding assistants (Claude Code). Data: NASA LRO LOLA, NASA PGDA, JPL DE421. Not an
official NASA product."

Subtitle times inside each clip come from the pauses ffmpeg finds in the audio (silencedetect); nobody has
listened to check them word by word. Make only this video with `python scripts/make_videos.py voice`.

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
