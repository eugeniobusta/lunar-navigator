// The relay of the VR live view (docs/XR.md, "Live view and recording"). The headset posts its state here through
// a Cloudflare quick tunnel; the viewer on this Mac reads it from here directly. Quick tunnels do not carry
// Server-Sent Events, so the tunnel is only used for headset -> Mac; the stream is local.
//
//   POST /pose     the headset's newest state (text/plain JSON; CORS open, no preflight needed)
//   GET  /stream   Server-Sent Events with every state, for the viewer; refused if it came through the tunnel
//   GET  /...      the built site (web/dist), so the viewer is http://localhost:8787/xr/?watch
//
// Usage:  make spectate              (builds, then runs this with --tunnel)
//         node scripts/spectator_relay.mjs [--tunnel] [--no-open]
// --tunnel starts `cloudflared tunnel --url http://localhost:8787`, reads the trycloudflare address from its
// output, prints the two addresses to use and opens the viewer in Google Chrome. Ctrl+C stops everything.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8787;
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
const SITE = 'https://claudes-plan-lunar-navigator.vercel.app/xr/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.csv': 'text/csv; charset=utf-8', '.woff2': 'font/woff2', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

let latest = null;
let received = 0;
const viewers = new Set();

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // A request that came through the tunnel carries Cloudflare's headers: it may only post a pose.
  const viaTunnel = req.headers['cf-ray'] != null || req.headers['cf-connecting-ip'] != null;
  if (path === '/pose') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS).end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 200_000) {
        req.destroy(); // a state is a few kilobytes
      }
    });
    req.on('end', () => {
      try {
        JSON.parse(body);
      } catch {
        res.writeHead(400, CORS).end();
        return;
      }
      latest = body;
      received++;
      for (const v of viewers) {
        v.write(`data: ${body}\n\n`);
      }
      res.writeHead(204, CORS).end();
    });
    return;
  }
  if (viaTunnel) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('Only /pose is open through the tunnel.\n');
    return;
  }
  if (path === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': the VR live view\n\n');
    viewers.add(res);
    req.on('close', () => viewers.delete(res));
    return;
  }
  if (path === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ received, viewers: viewers.size, bytes: latest?.length ?? 0 }));
    return;
  }
  // The built site.
  let file = normalize(join(DIST, path));
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found. Run `make build && make xr` first.\n');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});

const WATCH = `http://localhost:${PORT}/xr/?watch`;
let tunnel = null;
const stop = () => {
  tunnel?.kill('SIGINT');
  for (const v of viewers) {
    v.end();
  }
  server.close();
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use: another relay is running. Stop it first.` : e);
  process.exit(1);
});
server.listen(PORT, () => {
  if (!existsSync(join(DIST, 'xr', 'index.html'))) {
    console.log('web/dist/xr is missing: run `make build && make xr` (or `make spectate`).');
  }
  if (!process.argv.includes('--tunnel')) {
    console.log(`Relay on http://localhost:${PORT} (no tunnel). Viewer: ${WATCH}`);
    return;
  }
  console.log('Starting the Cloudflare tunnel...');
  tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  const read = (chunk) => {
    const words = String(chunk).match(/https:\/\/([a-z0-9]+(?:-[a-z0-9]+)+)\.trycloudflare\.com/u)?.[1];
    if (!words || found) {
      return;
    }
    found = true;
    const line = '='.repeat(100);
    console.log(`\n${line}\n\n   QUEST:  ${SITE}?live=${words}\n\n   MAC:    ${WATCH}\n\n${line}\n`);
    console.log('Open the QUEST address in the Quest Browser and press "Enter VR". A green LIVE dot on the panel means it is sending.');
    console.log('On the Mac: click once for sound; RECORD (or the R key) starts and stops a recording. Ctrl+C here stops everything.\n');
    if (!process.argv.includes('--no-open')) {
      spawn('open', ['-a', 'Google Chrome', WATCH], { stdio: 'ignore' }).on('error', () => undefined);
    }
  };
  tunnel.stdout.on('data', read);
  tunnel.stderr.on('data', read);
  tunnel.on('error', () => {
    console.error('cloudflared did not start. Install it with: brew install cloudflared');
    stop();
  });
  tunnel.on('exit', (code) => {
    if (!found) {
      console.error(`cloudflared stopped before giving an address (exit ${code}).`);
    }
    stop();
  });
});
