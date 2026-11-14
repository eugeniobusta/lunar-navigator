// MoonBox Web Serial link. Protocol: docs/INTERFACES.md section 7.
// Lines: "SUN,<az>,<el>,<frac>"  "EARTH,<az>,<el>,<vis>"  "HELLO" -> board replies "MOONBOX,<version>".
export const MOONBOX_BAUD = 115200;
export const MOONBOX_MAX_HZ = 20;

export const sunLine = (az: number, el: number, frac: number) => `SUN,${az.toFixed(1)},${el.toFixed(2)},${frac.toFixed(2)}\n`;
export const earthLine = (az: number, el: number, vis: boolean) => `EARTH,${az.toFixed(1)},${el.toFixed(2)},${vis ? 1 : 0}\n`;

// Minimal typing for the parts of Web Serial we use (not in TypeScript's DOM lib yet).
interface Port {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  readable: ReadableStream<Uint8Array> | null;
}
interface SerialNav { serial?: { requestPort(): Promise<Port> } }

export const serialSupported = () => typeof navigator !== "undefined" && !!(navigator as unknown as SerialNav).serial;

export class MoonBox {
  private port: Port | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private enc = new TextEncoder();
  private last = 0;

  async connect(): Promise<string> {
    const nav = navigator as unknown as SerialNav;
    if (!nav.serial) throw new Error("This browser cannot talk to USB devices. Use Chrome or Edge on a laptop.");
    this.port = await nav.serial.requestPort();
    await this.port.open({ baudRate: MOONBOX_BAUD });
    this.writer = this.port.writable!.getWriter();
    await this.writer.write(this.enc.encode("HELLO\n"));
    return this.readLine(1500);
  }

  private async readLine(timeoutMs: number): Promise<string> {
    const reader = this.port?.readable?.getReader();
    if (!reader) return "";
    const dec = new TextDecoder();
    let buf = "";
    const timer = setTimeout(() => reader.cancel(), timeoutMs);
    try {
      while (!buf.includes("\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
      }
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    return buf.trim();
  }

  /** Sends one SUN and one EARTH line, at most MOONBOX_MAX_HZ times per second. */
  async send(sunAz: number, sunEl: number, sunFrac: number, earthAz: number, earthEl: number, earthVis: boolean) {
    const now = performance.now();
    if (!this.writer || now - this.last < 1000 / MOONBOX_MAX_HZ) return;
    this.last = now;
    await this.writer.write(this.enc.encode(sunLine(sunAz, sunEl, sunFrac) + earthLine(earthAz, earthEl, earthVis)));
  }

  async disconnect() {
    this.writer?.releaseLock();
    await this.port?.close();
    this.port = null; this.writer = null;
  }

  get connected() { return this.port !== null; }
}
