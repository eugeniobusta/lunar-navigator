# Opening: Earth → Moon → south pole → Navigator

A self-contained, presenter-controlled browser opening. No build step, no network, no libraries.

## Run

```bash
cd media/intro
python3 -m http.server 8765
```

Open http://localhost:8765 and press **F** for fullscreen. (Opening `index.html` straight from disk also works in most browsers.)

## Controls

| Key | Action |
|---|---|
| Space / Right Arrow | Advance exactly one beat |
| Left Arrow | Back one beat |
| R | Reset to the quiet ready frame |
| F | Fullscreen |

Discreet on-screen buttons (bottom-right, they appear when the mouse moves) do the same. Nothing animates until you advance. Each transition runs once, eases to its endpoint and holds as long as you like. Key presses and clicks during a transition are ignored.

Beats: 0 ready frame · 1 Earth builds itself · 2 pull back, Moon revealed · 3 approach the south pole · 4 Lunar Landing Site Navigator interface.

## Tune the timing

`intro.js`, top of file, `CFG.durations` (milliseconds, one per transition):

```js
durations: [5600, 5200, 5200, 6400]   // ready→1, 1→2, 2→3, 3→4
```

Other settings in `CFG`: `demoUrl` (shows an "Open demo" button on the last beat), `shot` (screenshot path), `shotCropTop`, `heading`, `poleCaption`. Colours live in `PAL` (HackAthlone palette).

## Screenshot for beat 4

Beat 4 stages three crops of `shots/orbit.png` (map, site list, time controls). It is in place now. `shotCropTop: 104` trims the macOS menu bar, window title bar and the emulator's Runtime/Editor overlay. The crop boxes (`REG`) assume a 1280×832 screenshot; change `shotSourceW/H` and `REG` if you replace it. If the file is missing, labelled `PLACEHOLDER` boxes show instead.

`shots/landing-point.png` and `shots/vr.png` are the other two screenshots; the deck uses crops of them (in `media/screens/`).

## What is real and what is stylised

- Earth coastlines: real geometry, Natural Earth 1:50m land (public domain). The interior strokes are decorative, not data.
- Moon: stylised. Maria are hatched approximations and craters are random plus a few named ones; this is not a lunar map.
- Distance Earth-Moon is compressed and the Moon is turned to show its maria. **Not to scale.**
- South pole grid and marker: illustrative only. They carry no coordinates, scores or measurements and imply no real site.
- Beat 4 shows only what is in your screenshot.

## Reduced motion

If the OS asks for reduced motion, each beat becomes a short fade (`reducedMotionFadeMs`) and holds. Not yet tested on a device with the setting on.

## Test hooks

`window.INTRO` exposes `jump(beat)`, `state()`, `frame(now)`, `setClock(ms)` for rehearsal and testing.

## Files

`index.html` page and controls · `intro.js` engine · `earth-data.js` generated coastline data (do not edit by hand).
