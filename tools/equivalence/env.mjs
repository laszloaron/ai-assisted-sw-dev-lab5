// Fake browser environment for running the game headless in Node.
//
// Everything the game touches outside plain JavaScript is replaced by a fake
// that RECORDS what the game did with it: every WebGPU call (including buffer
// contents and shader source), every WebAudio call and every console warning.
// Time (requestAnimationFrame, performance.now) and Math.random are driven by
// the harness so two runs of the same game are bit-for-bit deterministic.
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

export const WIDTH = 1280;
export const HEIGHT = 720;

/** Serialises a call argument into a stable string. Binary data is hashed. */
function ser(v, seen = new Set()) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const t = typeof v;
  if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (t === "string") return JSON.stringify(v);
  if (t === "boolean" || t === "bigint") return String(v);
  if (t === "function") return v.__fakeId ? `@${v.__fakeId}` : "fn";
  if (v.__fakeId) return `@${v.__fakeId}`;
  if (v instanceof ArrayBuffer) return bytes(new Uint8Array(v));
  if (ArrayBuffer.isView(v)) return bytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  if (seen.has(v)) return "<cycle>";
  seen.add(v);
  if (Array.isArray(v)) return `[${v.map((x) => ser(x, seen)).join(",")}]`;
  if (typeof v.nodeType === "number") return `<${v.nodeName}#${v.id}>`;
  return `{${Object.keys(v).map((k) => `${k}:${ser(v[k], seen)}`).join(",")}}`;
}
function bytes(u8) {
  return `bytes(${u8.length},${createHash("sha1").update(u8).digest("hex").slice(0, 16)})`;
}

export function installEnvironment({ html, storage }) {
  const log = [];
  const record = (line) => log.push(line);

  // ---- deterministic time and randomness ----
  let now = 0;
  let rafCallback = null;
  let seed = 0x5eed;
  Math.random = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.defineProperty(performance, "now", { value: () => now, configurable: true });

  // ---- DOM ----
  const dom = new JSDOM(html, { url: "http://localhost/" });
  const w = dom.window;
  for (const s of w.document.querySelectorAll("script")) s.remove();
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  const globals = {
    window: w, document: w.document, localStorage: w.localStorage,
    HTMLElement: w.HTMLElement, HTMLCanvasElement: w.HTMLCanvasElement,
    KeyboardEvent: w.KeyboardEvent, MouseEvent: w.MouseEvent, Event: w.Event,
    MutationObserver: w.MutationObserver,
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1; },
    cancelAnimationFrame: () => { rafCallback = null; },
    ResizeObserver: class { observe() {} disconnect() {} },
    AudioContext: FakeAudioContext,
    GPUBufferUsage: { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 },
    GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 },
    GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
    GPUMapMode: { READ: 1, WRITE: 2 },
  };
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  w.requestAnimationFrame = globals.requestAnimationFrame;

  // ---- generic recording fake ----
  let fakeCount = 0;
  // A fake is callable AND has properties, because the game uses both shapes
  // (`encoder.finish()` as well as `filter.frequency.value = x`).
  function fake(name, overrides = {}, callLabel = null) {
    const id = `${name}#${fakeCount++}`;
    // copy descriptors so getters (e.g. a live `currentTime`) stay live
    const props = Object.defineProperties({ __fakeId: id }, Object.getOwnPropertyDescriptors(overrides));
    return new Proxy(function () {}, {
      apply(_t, _this, args) {
        record(`${callLabel ?? id}(${args.map((a) => ser(a)).join(", ")})`);
        return fake(`${name}()`);
      },
      get(_t, p) {
        if (typeof p === "symbol" || p === "then") return undefined;
        if (p in props) return props[p];
        const child = fake(`${name}.${p}`, {}, `${id}.${p}`);
        props[p] = child;
        return child;
      },
      set(_t, p, v) {
        record(`${id}.${String(p)} = ${ser(v)}`);
        props[p] = v;
        return true;
      },
    });
  }
  const logged = (name, fn) => (...args) => {
    record(`${name}(${args.map((a) => ser(a)).join(", ")})`);
    return fn(...args);
  };

  // ---- WebGPU ----
  const texture = (desc) => {
    const size = Array.isArray(desc.size) ? desc.size : [desc.size.width, desc.size.height];
    return fake("texture", { width: size[0], height: size[1], destroy: logged("texture.destroy", () => {}) });
  };
  // writeBuffer must hash only the bytes actually written
  const writeBuffer = (buf, off, data, dataOff = 0, size) => {
    const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const elem = data instanceof ArrayBuffer || data instanceof Uint8Array ? 1 : data.BYTES_PER_ELEMENT;
    const start = dataOff * elem;
    const len = size === undefined ? u8.length - start : size * elem;
    record(`queue.writeBuffer(${ser(buf)}, ${off}, ${bytes(u8.subarray(start, start + len))})`);
  };
  const device = fake("device", {
    limits: { maxTextureDimension2D: 8192 },
    lost: new Promise(() => {}),
    queue: fake("queue", { writeBuffer }),
    addEventListener: () => {},
    createShaderModule: logged("device.createShaderModule", (desc) =>
      fake("shader", { getCompilationInfo: () => Promise.resolve({ messages: [] }) })),
    createBuffer: logged("device.createBuffer", (desc) => {
      const mapped = new ArrayBuffer(desc.size);
      const buf = fake("buffer", {
        getMappedRange: () => mapped,
        unmap: () => record(`buffer.unmap ${bytes(new Uint8Array(mapped))}`),
        destroy: () => record("buffer.destroy"),
      });
      return buf;
    }),
    createTexture: logged("device.createTexture", texture),
  });
  const adapter = {
    info: { vendor: "fake", architecture: "", description: "" },
    requestDevice: async () => device,
  };
  const gpu = {
    requestAdapter: async () => adapter,
    getPreferredCanvasFormat: () => "bgra8unorm",
  };
  const nav = { gpu, getGamepads: () => [], userAgent: "equivalence-harness" };
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });

  // ---- canvas, pointer lock ----
  const canvas = w.document.getElementById("gfx");
  Object.defineProperty(canvas, "clientWidth", { value: WIDTH });
  Object.defineProperty(canvas, "clientHeight", { value: HEIGHT });
  const context = fake("context", {
    configure: logged("context.configure", () => {}),
    getCurrentTexture: () => fake("swapchain", { width: canvas.width, height: canvas.height }),
  });
  canvas.getContext = (type) => (type === "webgpu" ? context : null);
  let locked = false;
  Object.defineProperty(w.document, "pointerLockElement", { get: () => (locked ? canvas : null) });
  const lockChanged = () => queueMicrotask(() => w.document.dispatchEvent(new w.Event("pointerlockchange")));
  canvas.requestPointerLock = () => {
    record("requestPointerLock");
    if (!locked) { locked = true; lockChanged(); }
    return Promise.resolve();
  };
  w.document.exitPointerLock = () => {
    record("exitPointerLock");
    if (locked) { locked = false; lockChanged(); }
  };

  // ---- console ----
  console.warn = (...a) => record(`console.warn ${a.map(String).join(" ")}`);
  console.error = (...a) => record(`console.error ${a.map(String).join(" ")}`);
  console.info = () => {}; // contains wall-clock timings
  console.log = () => {};

  // ---- WebAudio ----
  function FakeAudioContext() {
    return fake("audio", {
      get currentTime() { return now / 1000; },
      sampleRate: 48000,
      state: "running",
      resume: async () => {},
      createBuffer: logged("audio.createBuffer", (channels, length, sampleRate) => {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, data,
          getChannelData: (c) => data[c],
          copyToChannel: (src, c, offset = 0) => data[c].set(src, offset),
        };
      }),
    });
  }

  // ---- driver ----
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    window: w,
    document: w.document,
    canvas,
    log,
    get locked() { return locked; },
    async waitForFirstFrame() {
      for (let i = 0; i < 100 && !rafCallback; i++) await flush();
      if (!rafCallback) throw new Error("game never requested an animation frame");
    },
    async tick(dtMs) {
      now += dtMs;
      const cb = rafCallback;
      rafCallback = null;
      cb?.(now);
      await flush();
    },
    key(type, code) {
      w.dispatchEvent(new w.KeyboardEvent(type, { code, bubbles: true }));
    },
    mouse(type, button = 0, target = canvas) {
      target.dispatchEvent(new w.MouseEvent(type, { button, bubbles: true }));
    },
    mouseMove(dx, dy) {
      const ev = new w.MouseEvent("mousemove", { bubbles: true });
      Object.defineProperty(ev, "movementX", { value: dx });
      Object.defineProperty(ev, "movementY", { value: dy });
      w.dispatchEvent(ev);
    },
    has(selector) {
      return !!w.document.querySelector(selector);
    },
    click(selector) {
      const el = w.document.querySelector(selector);
      record(`click ${selector} ${el ? "found" : "missing"}`);
      el?.click();
    },
    unlockPointer() { w.document.exitPointerLock(); },
  };
}
