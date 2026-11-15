"""Cuts the three videos from the recorded clips with ffmpeg (no app code involved):

  media/submission-30s.mp4  for the Space Apps form (hard limit 30 s): website, then the VR, with burned-in subtitles
  media/pitch-3min.mp4      for the live pitch, silent (the team speaks over it), docs/PITCH.md section by section
  media/pitch-2min.mp4      the same story cut to two minutes

Sources: media/clips/01 to 07 and 11 to 13 (scripts/record_footage.mjs) and media/vr-demo-50s.mp4, the recording of
a real VR session (copied from the lead's Downloads; it is 61 s long and its audio track is silent).
All three videos have no audio. The last 5 seconds of the two pitch videos carry a QR code to the live site.

Text is drawn by scripts/video_text.mjs (this ffmpeg build has no text filter) and laid over with `overlay`.
Run: uv run --with "qrcode[pil]" python scripts/make_videos.py     (needs ffmpeg and web/node_modules)
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
CLIPS = MEDIA / "clips"
VR = MEDIA / "vr-demo-50s.mp4"
LIVE = "https://claudes-plan-lunar-navigator.vercel.app"
FPS = 30
QR_SECONDS = 5.0


def clip(name):
    return CLIPS / f"{name}.webm"


# A segment: (source, start in the source, seconds taken from it, seconds it lasts in the video).
# Where the two lengths differ the footage is slowed down or sped up; nothing is looped.
HOME, EXPLORE, PLAN, OVERVIEW, FINDER, WINDOWS, COMPARE = (clip(n) for n in (
    "01-home", "02-explore-a-site", "03-plan-a-landing", "04-overview", "05-site-finder", "06-window-finder",
    "07-compare-sites"))
IM2, BATTERY, CHECKED = clip("11-im2-athena"), clip("12-battery"), clip("13-how-we-checked")

SUBMISSION = [
    # about 15 s of website
    (HOME, 0.0, 4.5, 4.5, "Claude's P.L.A.N: where, and when, a lander can touch down at the Moon's south pole."),
    (FINDER, 4.6, 6.0, 6.0, "Site Finder: every 120 m square checked against NASA's Artemis III limits. Green is good, amber acceptable, hatched red unsafe."),
    (WINDOWS, 2.6, 4.5, 4.5, "Window Finder: the days a mission keeps sunlight and Earth in view. 32 landing days a year at Malapert Massif."),
    # about 14 s of the real VR session
    (VR, 2.0, 3.0, 3.0, "The same data in 3D and VR: the whole Moon, with the Sun and Earth where they really are."),
    (VR, 8.0, 3.5, 3.5, "Fly down to the south pole and NASA's candidate landing sites."),
    (VR, 18.5, 2.5, 2.5, "The safe ground, coloured as on the map."),
    (VR, 24.5, 2.5, 2.5, "Choose a site and land."),
    (VR, 35.5, 2.5, 2.5, "Stand on the surface: a low Sun, long shadows, Earth above the hills."),
]

# docs/PITCH.md, section by section. PITCH.md times only the hook (30 s); the other lengths are this script's.
PITCH_3MIN = [
    ("1  Why it matters", [(HOME, 0.0, 9.6, 10.0), (VR, 0.0, 7.0, 8.0), (IM2, 0.0, 9.6, 12.0)]),                      # hook, 30 s
    ("2  The problem", [(EXPLORE, 0.0, 10.1, 13.0), (OVERVIEW, 0.0, 9.3, 12.0)]),                                    # 25 s
    ("3  Live demo", [(FINDER, 0.0, 16.5, 18.0), (PLAN, 0.0, 13.2, 14.0), (COMPARE, 0.0, 12.3, 13.0),
                      (WINDOWS, 0.0, 10.7, 11.0), (VR, 8.0, 19.0, 9.0)]),                                            # 65 s
    ("4  Surviving the night", [(BATTERY, 0.0, 9.3, 11.0), (VR, 28.0, 11.0, 9.0)]),                                   # 20 s
    ("5  How we checked", [(CHECKED, 0.0, 5.5, 10.0), (CHECKED, 5.5, 5.4, 10.0)]),                                    # 20 s
    ("6  Who it is for, and what is next", [(VR, 40.0, 6.0, 6.0), (VR, 51.0, 7.0, 9.0), (HOME, 0.0, 2.5, 5.0)]),      # 20 s
]
PITCH_2MIN = [
    ("1  Why it matters", [(HOME, 0.0, 6.0, 6.0), (VR, 1.0, 5.0, 5.0), (IM2, 2.0, 7.6, 9.0)]),                        # 20 s
    ("2  The problem", [(EXPLORE, 0.0, 8.0, 8.0), (OVERVIEW, 1.0, 7.0, 7.0)]),                                        # 15 s
    ("3  Live demo", [(FINDER, 0.0, 13.0, 13.0), (PLAN, 1.0, 11.0, 10.0), (COMPARE, 1.5, 10.8, 9.0),
                      (WINDOWS, 2.0, 8.0, 7.0), (VR, 8.0, 19.0, 6.0)]),                                              # 45 s
    ("4  Surviving the night", [(BATTERY, 2.5, 6.8, 7.0), (VR, 29.0, 9.0, 6.0)]),                                     # 13 s
    ("5  How we checked", [(CHECKED, 1.5, 9.4, 12.0)]),                                                               # 12 s
    ("6  Who it is for, and what is next", [(VR, 51.0, 7.0, 7.0), (VR, 40.0, 5.0, 3.0), (HOME, 0.0, 2.5, 5.0)]),      # 15 s
]


def run(args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *map(str, args)], check=True)


def cut(seg, out):
    """One segment as 1920 x 1080, 30 fps H.264 without audio, exactly as long as it should be."""
    src, start, taken, lasts = seg[:4]
    vf = f"setpts={lasts / taken:.6f}*PTS,fps={FPS},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1,format=yuv420p"
    frames = round(lasts * FPS)
    # tpad holds the last frame if the source runs a few frames short; -frames:v makes the length exact.
    run(["-ss", f"{start:.3f}", "-t", f"{taken + 0.2:.3f}", "-i", src, "-an", "-vf", vf + ",tpad=stop_mode=clone:stop_duration=1",
         "-frames:v", frames, "-c:v", "libx264", "-preset", "fast", "-crf", "16", out])
    return frames / FPS


def build(name, segments, overlays, comment, tmp):
    """Joins the segments, lays the overlays over (PNG path, from second, to second) and writes media/<name>."""
    parts, t = [], 0.0
    for i, seg in enumerate(segments):
        part = tmp / f"{name}-{i:02d}.mp4"
        t += cut(seg, part)
        parts.append(part)
    listing = tmp / f"{name}.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in parts))
    args = ["-f", "concat", "-safe", "0", "-i", listing]
    for png, _, _ in overlays:
        # Looped, so the picture is there whenever its time comes (a single frame is dropped after a few seconds).
        args += ["-loop", "1", "-framerate", FPS, "-i", png]
    chain, last = [], "0:v"
    for k, (_, a, b) in enumerate(overlays, 1):
        chain.append(f"[{last}][{k}:v]overlay=enable='between(t,{a:.3f},{b:.3f})'[v{k}]")
        last = f"v{k}"
    if chain:
        args += ["-filter_complex", ";".join(chain), "-map", f"[{last}]"]
    out = MEDIA / name
    run([*args, "-t", f"{t:.3f}", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", FPS,
         "-movflags", "+faststart", "-metadata", f"comment={comment}", "-metadata", f"title={name}", out])
    return out, t


def main():
    import qrcode
    missing = [p for p in (VR, HOME, EXPLORE, PLAN, OVERVIEW, FINDER, WINDOWS, COMPARE, IM2, BATTERY, CHECKED) if not p.exists()]
    if missing:
        sys.exit("missing: " + ", ".join(str(p.relative_to(ROOT)) for p in missing))
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=16, border=3)
        q.add_data(LIVE)
        q.make(fit=True)
        q.make_image(fill_color="black", back_color="white").save(tmp / "qr-code.png")
        # Every piece of text, drawn once.
        spec = [{"id": f"sub{i}", "kind": "caption", "text": s[4]} for i, s in enumerate(SUBMISSION)]
        spec += [{"id": f"lab{i}", "kind": "label", "text": title} for i, (title, _) in enumerate(PITCH_3MIN)]
        spec.append({"id": "qr", "kind": "qr", "text": "Try it yourself", "sub": LIVE.replace("https://", ""), "image": str(tmp / "qr-code.png")})
        (tmp / "spec.json").write_text(json.dumps(spec))
        subprocess.run(["node", str(ROOT / "scripts" / "video_text.mjs"), str(tmp / "spec.json"), str(tmp)], check=True)

        made = []
        # The submission video: one subtitle per segment, a fifth of a second clear of each cut.
        overlays, t = [], 0.0
        for i, s in enumerate(SUBMISSION):
            overlays.append((tmp / f"sub{i}.png", t + 0.15, t + s[3] - 0.15))
            t += s[3]
        made.append(build("submission-30s.mp4", SUBMISSION, overlays,
                          "No narration: this video is silent. Built with AI coding assistants (Claude Code). "
                          "The project's VR view has a narrator voice generated with ElevenLabs (AI).", tmp))
        # The pitch videos: silent, a section label in the corner, the QR code over the last five seconds.
        for name, plan in (("pitch-3min.mp4", PITCH_3MIN), ("pitch-2min.mp4", PITCH_2MIN)):
            segments, overlays, t = [], [], 0.0
            for i, (_, segs) in enumerate(plan):
                length = sum(s[3] for s in segs)
                overlays.append((tmp / f"lab{i}.png", t, t + length))
                segments += segs
                t += length
            overlays[-1] = (overlays[-1][0], overlays[-1][1], t - QR_SECONDS)   # the label makes way for the QR card
            overlays.append((tmp / "qr.png", t - QR_SECONDS, t))                # the card: a title, the code, the address
            made.append(build(name, segments, overlays, "Silent: the team speaks over it. Built with AI coding assistants (Claude Code).", tmp))
        for out, planned in made:
            got = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                       capture_output=True, text=True, check=True).stdout)
            print(f"{out.relative_to(ROOT)}: {got:.2f} s (planned {planned:.1f} s), {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
