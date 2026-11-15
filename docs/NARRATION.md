# Narration for the VR journey

Voice: AI-generated with ElevenLabs (voice "Dan", model `eleven_multilingual_v2`). The clips are generated ahead
of time by `scripts/make_voice.mjs` and stored in `xr/public/voice/`; the app never calls ElevenLabs.

The VR view (docs/XR.md) is a journey of named moments. Each moment puts one short line in the caption slot and
is announced on a hook; the narrator listens to that hook and plays the moment's clip the first time it is
heard. This file has the clips as recorded, then every moment with its longer draft narration.

## The clips as recorded

Each clip says one thing about what you see and one thing to do, in about 12 seconds at most. A general clip
never says a number that depends on where or when the visitor stands (the caption shows those). A site clip
only uses the long-run figures of the table of the six places below, said as "over three years" (1157 days).
`xr/src/voice.test.ts` checks both rules against the recorded text.

| Clip | Text |
|------|------|
| `moon-intro` | This is the Moon, seen from below its south pole, where the next astronauts plan to land. Press the green Start button to set time running. |
| `start-motion` | A whole month now passes every thirty seconds. Watch the line between day and night cross the Moon. When you are ready, press South Pole. |
| `pole-arrived` | The Moon hardly tilts, so at its pole the Sun only skims the horizon and shadows are very long. Six landing sites are marked. Pick one. |
| `site-recommended` | Our pick is Malapert Massif, in yellow. In our model the Earth never sets there, so a radio link home is always open. Select it to fly there. |
| `colours-on` | The colours show how good the ground is for landing. Green is good, amber is acceptable, red is poor, and striped ground is unsafe. Now choose a landing site. |
| `play` | Time is running: one Earth day every ten seconds. The Sun never passes overhead here; it slides around the horizon. To walk, point at the ground and pull the trigger. |
| `play-first-sunrise` | Sunrise. Sunlight means power for a lander. Because the Sun is so low, even a small rock throws a very long shadow. Look around you. |
| `sunset` | Sunset. With no air there is no dusk: the light simply goes out. A lander now runs on batteries until the Sun returns. Keep watching, or press Pause. |
| `earth-in-view` | There is the Earth. While you can see it, radio signals travel straight home, so a lander can talk to mission control. Look for it above the hills. |
| `earth-hidden` | The Earth has slipped behind the hills. Until it returns, messages home need a relay satellite. Keep time running to see it come back. |
| `teleport` | You moved. The shape of this ground is real, measured by a NASA laser from orbit, and it is 61 kilometres across. Point anywhere and pull the trigger to explore. |
| `landed:mma01` | You are standing on Malapert Massif. Over three years, the Earth is in the sky here one hundred percent of the time, and the Sun is up 46 percent. Press the green Play button. |
| `landed:mmo01` | This is Mons Mouton, the sunniest of our six sites. Over three years the Sun is up 73 percent of the time, and more sunlight means more solar power. Press the green Play button. |
| `landed:hw02` | This is Haworth. Over three years the Sun is up 48 percent of the time, and the longest night lasts 436 hours, about 18 days. Press the green Play button. |
| `landed:nr107` | This is Nobile Rim 1. Over three years the Sun is up 53 percent of the time and the Earth is in view 59 percent, so the radio link comes and goes. Press the green Play button. |
| `landed:dgr203` | This is de Gerlache Rim 2, the closest of our six sites to the pole. Over three years the Sun is up 58 percent of the time. Press the green Play button. |
| `landed:im2` | This is where the lander Athena came down in March 2025. It ended on its side in a small dark crater. Over three years the Sun is up here just 45 percent of the time. Press the green Play button. |

Sources of what the clips say: the percentages, the 436 hours and "closest to the pole" (88.1 S) are the table
of the six places; "about 18 days" is 436 / 24; 61 kilometres, Athena's landing and the speeds of time are in
the fixed figures; "the Moon hardly tilts" is the reason the Sun's centre never rises more than 1.59 degrees at
the pole (fixed figures). `fly-to-pole` and `flight` have no clip: the stage changes within seconds, and a
change of stage stops the voice.

## The hook

- In the code: `journey.on((e) => ...)` (`xr/src/journey.ts`, class `Journey`).
- From outside: `window.addEventListener('lunar-moment', (ev) => ev.detail)`.
- `detail` is `{ id, caption, facts, count }`: the moment's name, its caption line, the numbers the caption was
  built from (`siteName`, `latDeg`, `sunPct`, `earthPct`, `longestDarkH`, `movedM`), and how many times the
  moment has fired (so a voice can speak the long version the first time and stay quiet, or short, afterwards).
- `window.lunarMoments()` returns the moments so far, for a test or a log.

A voice should speak on `count === 1` unless noted, never over itself (drop or queue a clip if one is playing),
and stop when the stage changes.

## Rules for the text

1. Every number spoken is either (a) filled in at run time from `facts`, written `{sunPct}` below, or (b) a
   fixed figure with its source in the last column. Nothing else.
2. Numbers that depend on where and when the visitor stands (percentages of the 30 days, the longest night) are
   always (a): they change with the place, the date in the link and each move on the ground.
3. Short sentences, plain words, no jargon. One idea per moment. Under 12 seconds each, since the visitor may
   press the next button at any time.

## Fixed figures and their sources

| Figure | Value | Source |
|--------|-------|--------|
| Moon's mean radius; diameter | 1737.4 km; 3474.8 km | IAU value used throughout the project (CLAUDE.md, `R_M` in `xr/src/geo.ts`) |
| Time from one new Moon to the next | 29.53 days | NASA Moon Fact Sheet (synodic period), https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html |
| Highest the Sun's centre gets above a flat horizon at the south pole | 1.59 degrees | our ephemeris (`/data/ephemeris.json`, JPL DE421), all 27,768 hourly samples from 1 November 2026 |
| Earth's centre seen from the south pole | between 6.8 degrees below and 6.9 degrees above a flat horizon | same ephemeris |
| Distance from the Moon's centre to the Earth's | 356,653 to 406,677 km | same ephemeris |
| Earth's width in the Moon's sky | 1.80 to 2.05 degrees | same ephemeris, Earth radius 6378.137 km |
| Sun's width in the Moon's sky | 0.523 to 0.543 degrees | same ephemeris (solar semi-diameter) |
| Size of the ground you can walk on at a site | 61.44 km across, one height every 120 m | `/data/terrain/sites/<id>/tile.json` (512 pixels of 120 m), NASA LOLA |
| Detail of the south-pole map | one height every 430 m | `/data/terrain/south_pole.json` (429.7 m), NASA LOLA |
| Shadow of a half-metre rock with the Sun 2 degrees up | 14.3 m | geometry: 0.5 / tan(2 deg); `shadowLength` in `xr/src/ground.ts`, tested |
| IM-2 Athena | landed 6 March 2025 near Mons Mouton, ended on its side in a small shadowed crater, mission over within 13 hours | `/data/missions.csv` (source there: https://lroc.im-ldi.com/images/1408) |

The six places, in our model (the website's `demHorizon` and `computeSeries`, 2 m above each site's own point,
over the whole ephemeris: 1157 days from 1 November 2026). `xr/src/journey.test.ts` prints this table and fails
if Malapert Massif's Earth figure is not 100 %.

| Place | Latitude | Sun up | Longest night | Earth in view |
|-------|----------|-------:|--------------:|--------------:|
| Malapert Massif (mma01) | 85.9 S | 45.5 % | 404 h | 100.0 % |
| Mons Mouton (mmo01) | 85.4 S | 73.3 % | 438 h | 59.7 % |
| Haworth (hw02) | 86.8 S | 48.4 % | 436 h | 58.4 % |
| Nobile Rim 1 (nr107) | 85.2 S | 53.1 % | 417 h | 58.7 % |
| de Gerlache Rim 2 (dgr203) | 88.1 S | 58.3 % | 451 h | 55.1 % |
| IM-2 Athena's landing spot (im2) | 84.8 S | 45.2 % | 456 h | 82.1 % |

These are long-run figures for a voice-over that names a place. The captions on screen use the 30 days being
played instead, at the exact point where the visitor stands, so the two can differ (at de Gerlache Rim 2 on 18
November 2026 the caption read "the Sun is up 76 % of these 30 days").

## The moments

`{...}` is filled from `facts` at run time. "Caption" is what the app shows today (`caption()` in `journey.ts`,
tested to stay under 72 characters).

### Stage 1: the whole Moon

| Moment | Fires when | Caption | Draft narration | Sources |
|--------|-----------|---------|-----------------|---------|
| `moon-intro` | the opening view is ready | The Moon, seen from below its south pole. Press Start. | "This is the Moon, 3,475 kilometres across, as NASA's Lunar Reconnaissance Orbiter mapped it. You are looking up at its south pole: the place where people plan to land next. Press Start." | diameter: table; imagery: NASA SVS CGI Moon Kit (LROC, LOLA) |
| `start-motion` | "Start" is pressed | One month every 30 seconds: day and night cross the Moon. | "Now time is running: a whole month every thirty seconds. Watch the line between day and night cross the Moon. The Sun goes all the way round. The Earth stays almost where it is, and turns once a day. The Sun and the Earth are drawn much closer and larger than they are; only their directions are real." | speeds: `MOON_HOURS_PER_S`; month: table; directions: ephemeris |
| `pause-motion` | "Pause" is pressed | Time is paused. | (silent) | |
| `fly-to-pole` | "South Pole" is pressed | Going down to the south pole. | "Down we go, to the south pole." | |
| `back-to-moon` | "Back to whole Moon" is pressed | Back to the whole Moon. | (silent) | |

### Stage 2: the south pole

| Moment | Fires when | Caption | Draft narration | Sources |
|--------|-----------|---------|-----------------|---------|
| `pole-arrived` | the view reaches the pole | The south pole. Pick a place to land. | "Here the Sun never climbs more than about a degree and a half above the horizon. Some crater floors never see it at all, and a few ridges are sunlit most of the time. Six places are marked. Pick one." | 1.59 degrees: table; craters that never see the Sun: NASA PGDA permanently shadowed regions (docs/DATA.md); "most of the time": Mons Mouton, 73.3 %, table of places |
| `site-recommended` | 5 seconds at the pole without a pick, or the pointer rests on Malapert's marker; once | Malapert Massif: Earth always in the sky, the Sun skims a giant ridge. | "Our suggestion is Malapert Massif. In our model the Earth never sets there, so a radio link home is always open." | Earth in view 100.0 %: table of places |
| `colours-on` | the colour switch is turned on | Green is good to land on, amber acceptable, red poor. | "These colours add up ten things a landing needs, such as sunlight, a view of Earth, gentle slopes and temperature. Green is good, amber is acceptable, red is poor. Hatched ground fails one of NASA's limits outright." | the website's classes (`rag.ts`), legend words from the website |
| `colours-off` | the switch is turned off | Colours off: the bare ground. | (silent) | |
| `flight` | a place is picked | Flying to {siteName}, {latDeg} S | "Flying to {siteName}, at {latDeg} degrees south." For IM-2: "Flying to where the lander Athena came down in March 2025. It ended on its side in a small dark crater, and the mission was over within 13 hours." | `facts`; Athena: table |
| `back-to-pole` | "Back to the south pole" is pressed on the surface | Back above the south pole. | (silent) | |

### Stage 3: on the surface

| Moment | Fires when | Caption | Draft narration | Sources |
|--------|-----------|---------|-----------------|---------|
| `landed` | the fade lifts on the surface | You are standing on {siteName}. Press Play. | "You are standing on {siteName}. The shape of the land around you is real: NASA measured it with a laser from orbit, one height every 120 metres. The small craters and rocks at your feet are our illustration of what the laser cannot see. Press Play." | 120 m: table; the on-screen label says the detail is illustrative |
| `play` | "Play" is pressed | Time is running: one day every 10 seconds. | "One Earth day now passes every ten seconds. Look for the Sun: it does not rise overhead, it slides along the horizon." | `SURFACE_HOURS_PER_S` |
| `play-first-sunrise` | while playing, the Sun's centre first comes above the skyline | Sunrise. Here the Sun is up {sunPct} % of these 30 days. | "Sunrise. At this spot the Sun is up {sunPct} per cent of these thirty days. Because it is so low, a rock half a metre high throws a shadow some fourteen metres long." | `facts.sunPct` (our model at the standing point); 14.3 m: table |
| `sunrise` | any later sunrise | the same caption | (silent, or "Sunrise again.") | |
| `sunset` | while playing, the Sun's centre goes below the skyline | Sunset. The longest night of these 30 days lasts {longestDarkH} hours. | "Sunset. There is no dusk on the Moon: with no air, the light just goes. The longest night here in these thirty days lasts {longestDarkH} hours. A lander has to keep warm and powered through it." | `facts.longestDarkH` |
| `earth-in-view` | while playing, the Earth's centre comes above the skyline | Earth is in view: a radio link home, {earthPct} % of these 30 days. | "There is the Earth, between three and four times as wide as the Sun looks. While you can see it, you can talk to it directly: here that is {earthPct} per cent of these thirty days." | `facts.earthPct`; widths: table (1.80 to 2.05 against 0.52 to 0.54 degrees) |
| `earth-hidden` | while playing, the Earth's centre goes below the skyline | Earth is behind the hills: no direct radio link. | "The Earth has gone behind the hills. Until it comes back, messages home need a relay satellite." | |
| `pause` | "Pause" is pressed | Time is paused. | (silent) | |
| `teleport` | the visitor moves to a point on the ground | Moved {movedM} m. | (silent; the first time: "You can go anywhere on this ground: it is 61 kilometres across.") | 61.44 km: table |

## What is deliberately not said

- Temperatures, ice and landing dates: the VR does not compute or show them. They are on the website, with their
  sources.
- Anything about the small craters and rocks as if they were real: they are illustrative.
- "Always" or "never" about sunlight: no place in the table has the Sun up all the time.

## To extend the voice

1. Record or generate one clip per row with text above; rows with `{...}` need either a clip per place (six
   places for `flight` and `landed`) or live text-to-speech for the numbers.
2. Listen for `lunar-moment`, look up the clip by `detail.id` (and `detail.facts.siteName`), play it if
   `detail.count === 1`.
3. Keep the caption: it is the subtitle, and the only channel for visitors who cannot hear the voice.
