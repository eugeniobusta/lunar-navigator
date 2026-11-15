// Generates the narrator's clips of the VR journey with ElevenLabs, once, ahead of time (docs/NARRATION.md).
// The app never calls ElevenLabs: it plays the files this script writes into xr/public/voice/.
//
// Usage (from the repository root):  node scripts/make_voice.mjs [voiceId]
// The API key is read from ~/.elevenlabs_key (outside the repository; never commit it, never print it).
// A clip that already exists with the same text is skipped, so a rerun costs nothing. To change a line, edit
// LINES below and rerun; to record a line again, delete its .mp3. Writes <id>.mp3 (":" in an id becomes "-")
// and lines.json (id -> text), which is also the caption the app shows while a clip plays (xr/src/voice.ts).
//
// Rules for the text (docs/NARRATION.md): half explaining, half what to do next; about 12 seconds at most; plain
// words. A general clip never says a number that depends on where or when the visitor stands (the caption shows
// those). A site clip ("landed:<site id>") may only use the long-run figures of the table in docs/NARRATION.md,
// said as "over three years" (the 1157 days of the ephemeris).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VOICE_ID = process.argv[2] ?? 'BHr135B5EUBtaWheVj8S'; // "Dan"
const MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'xr', 'public', 'voice');

// id (a moment of xr/src/journey.ts, or landed:<site id>) -> what the voice says
const LINES = {
  'moon-intro': 'This is the Moon, seen from below its south pole, where the next astronauts plan to land. Press the green Start button to set time running.',
  'start-motion': 'A whole month now passes every thirty seconds. Watch the line between day and night cross the Moon. When you are ready, press South Pole.',
  'pole-arrived': 'The Moon hardly tilts, so at its pole the Sun only skims the horizon and shadows are very long. Six landing sites are marked. Pick one.',
  'site-recommended': 'Our pick is Malapert Massif, in yellow. In our model the Earth never sets there, so a radio link home is always open. Select it to fly there.',
  'colours-on': 'The colours show how good the ground is for landing. Green is good, amber is acceptable, red is poor, and striped ground is unsafe. Now choose a landing site.',
  play: 'Time is running: one Earth day every ten seconds. The Sun never passes overhead here; it slides around the horizon. To walk, point at the ground and pull the trigger.',
  'play-first-sunrise': 'Sunrise. Sunlight means power for a lander. Because the Sun is so low, even a small rock throws a very long shadow. Look around you.',
  sunset: 'Sunset. With no air there is no dusk: the light simply goes out. A lander now runs on batteries until the Sun returns. Keep watching, or press Pause.',
  'earth-in-view': 'There is the Earth. While you can see it, radio signals travel straight home, so a lander can talk to mission control. Look for it above the hills.',
  'earth-hidden': 'The Earth has slipped behind the hills. Until it returns, messages home need a relay satellite. Keep time running to see it come back.',
  teleport: 'You moved. The shape of this ground is real, measured by a NASA laser from orbit, and it is 61 kilometres across. Point anywhere and pull the trigger to explore.',
  'landed:mma01': 'You are standing on Malapert Massif. Over three years, the Earth is in the sky here one hundred percent of the time, and the Sun is up 46 percent. Press the green Play button.',
  'landed:mmo01': 'This is Mons Mouton, the sunniest of our six sites. Over three years the Sun is up 73 percent of the time, and more sunlight means more solar power. Press the green Play button.',
  'landed:hw02': 'This is Haworth. Over three years the Sun is up 48 percent of the time, and the longest night lasts 436 hours, about 18 days. Press the green Play button.',
  'landed:nr107': 'This is Nobile Rim 1. Over three years the Sun is up 53 percent of the time and the Earth is in view 59 percent, so the radio link comes and goes. Press the green Play button.',
  'landed:dgr203': 'This is de Gerlache Rim 2, the closest of our six sites to the pole. Over three years the Sun is up 58 percent of the time. Press the green Play button.',
  'landed:im2': 'This is where the lander Athena came down in March 2025. It ended on its side in a small dark crater. Over three years the Sun is up here just 45 percent of the time. Press the green Play button.',
};

const fileOf = (id) => `${id.replace(':', '-')}.mp3`;
const jsonPath = join(OUT, 'lines.json');
const before = existsSync(jsonPath) ? (JSON.parse(readFileSync(jsonPath, 'utf8')).lines ?? {}) : {};
mkdirSync(OUT, { recursive: true });
const write = (lines) =>
  writeFileSync(jsonPath, `${JSON.stringify({ voice: `AI-generated with ElevenLabs (voice ${VOICE_ID}, model ${MODEL})`, lines }, null, 2)}\n`);

let key = null;
let used = 0;
let made = 0;
const done = {};
for (const [id, text] of Object.entries(LINES)) {
  const path = join(OUT, fileOf(id));
  if (existsSync(path) && before[id] === text) {
    done[id] = text;
    continue;
  }
  if (key == null) {
    // The key is the "sk_..." token in the file, whatever else was pasted around it.
    const file = readFileSync(join(homedir(), '.elevenlabs_key'), 'utf8').trim();
    key = file.match(/sk_[0-9a-f]{32,}/u)?.[0] ?? file;
  }
  let res = null;
  for (let attempt = 1; attempt <= 4 && !res?.ok; attempt++) {
    try {
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${FORMAT}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: MODEL }),
      });
      if (!res.ok && res.status < 500 && res.status !== 429) {
        break; // a refusal: trying again would not help
      }
    } catch (e) {
      console.log(`${id}: attempt ${attempt} failed (${e.cause?.code ?? e.message})`);
    }
  }
  if (!res?.ok) {
    write(done);
    console.error(`${id}: not generated${res ? ` (HTTP ${res.status}: ${(await res.text()).slice(0, 300)})` : ''}`);
    console.error(`Stopped. ${made} clips generated, ${used} characters used.`);
    process.exit(1);
  }
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  done[id] = text;
  write(done);
  used += text.length;
  made++;
  console.log(`${fileOf(id).padEnd(26)} ${String(statSync(path).size).padStart(7)} bytes  ${text.length} characters`);
}
write(done);
const total = Object.values(LINES).reduce((n, t) => n + t.length, 0);
console.log(`${made} clips generated, ${Object.keys(LINES).length - made} already there. Characters used in this run: ${used} (whole script: ${total}).`);
