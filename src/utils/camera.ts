/**
 * Rust+ camera ray-data decoder — a faithful TypeScript port of the renderer in
 * liamcottle/rustplus.js (camera.js). This is the verified algorithm used by
 * working Rust+ camera viewers, so the image is accurate (not a guess).
 *
 * How it works:
 *  1. A seeded xorshift PRNG (IndexGenerator, seed 1337) shuffles a buffer of
 *     sample (x,y) positions — the server sends samples in this shuffled order.
 *  2. Each frame's rayData is a stateful delta-encoded stream decoded with a
 *     64-entry lookback table into (distance, alignment, material) triples.
 *  3. We accumulate the last ~10 frames and composite them into one image, then
 *     colour each sample: sky = light blue, else alignment × material colour.
 */

export interface CameraInfo {
  width: number;
  height: number;
  near_plane?: number;
  far_plane?: number;
  control_flags?: number;
}

export interface RawRayFrame {
  rayData: Uint8Array;
  sampleOffset: number;
}

class IndexGenerator {
  state: number;
  constructor(e: number) {
    this.state = 0 | e;
    this.nextState();
  }
  nextInt(e: number): number {
    let t = ((this.nextState() * (0 | e)) / 4294967295) | 0;
    if (t < 0) t = e + t - 1;
    return 0 | t;
  }
  nextState(): number {
    let e = this.state;
    const t = e;
    e = ((e = ((e = (e ^ ((e << 13) | 0)) | 0) ^ ((e >>> 17) | 0)) | 0) ^ ((e << 5) | 0)) | 0;
    this.state = e;
    return t >= 0 ? t : 4294967295 + t - 1;
  }
}

const MATERIAL_COLOURS: [number, number, number][] = [
  [0.5, 0.5, 0.5], [0.8, 0.7, 0.7], [0.3, 0.7, 1], [0.6, 0.6, 0.6],
  [0.7, 0.7, 0.7], [0.8, 0.6, 0.4], [1, 0.4, 0.4], [1, 0.1, 0.1],
];

// Cache the shuffled sample-position buffer per (width,height) — it's static.
let cachedDims = '';
let cachedSampleBuffer: Int16Array | null = null;

function getSampleBuffer(width: number, height: number): Int16Array {
  const key = `${width}x${height}`;
  if (cachedSampleBuffer && cachedDims === key) return cachedSampleBuffer;

  const samplePositionBuffer = new Int16Array(width * height * 2);
  for (let w = 0, _ = 0; _ < height; _++) {
    for (let g = 0; g < width; g++) {
      samplePositionBuffer[w] = g;
      samplePositionBuffer[++w] = _;
      w++;
    }
  }
  const B = new IndexGenerator(1337);
  for (let R = width * height - 1; R >= 1; R--) {
    const C = 2 * R;
    const I = 2 * B.nextInt(R + 1);
    const P = samplePositionBuffer[C];
    const k = samplePositionBuffer[C + 1];
    const A = samplePositionBuffer[I];
    const F = samplePositionBuffer[I + 1];
    samplePositionBuffer[I] = P;
    samplePositionBuffer[I + 1] = k;
    samplePositionBuffer[C] = A;
    samplePositionBuffer[C + 1] = F;
  }
  cachedSampleBuffer = samplePositionBuffer;
  cachedDims = key;
  return samplePositionBuffer;
}

/**
 * Render accumulated ray frames into RGBA ImageData. Pass the last ~10+ frames
 * (the renderer composites them, since each frame only covers some samples).
 */
export function renderCameraFrames(
  frames: RawRayFrame[],
  width: number,
  height: number,
): ImageData | null {
  if (width <= 0 || height <= 0 || frames.length === 0) return null;

  const samplePositionBuffer = getSampleBuffer(width, height);
  const output: ([number, number, number] | undefined)[] = new Array(width * height);

  for (const frame of frames) {
    let sampleOffset = 2 * frame.sampleOffset;
    let dataPointer = 0;
    const rayLookback: number[][] = new Array(64);
    for (let r = 0; r < 64; r++) rayLookback[r] = [0, 0, 0];

    const rayData = frame.rayData;

    while (true) {
      if (dataPointer >= rayData.length - 1) break;

      let t = 0, r = 0, i = 0;
      const n = rayData[dataPointer++];

      if (n === 255) {
        const l = rayData[dataPointer++];
        const o = rayData[dataPointer++];
        const s = rayData[dataPointer++];
        t = (l << 2) | (o >> 6);
        r = 63 & o;
        i = s;
        const u = (3 * ((t / 128) | 0) + 5 * ((r / 16) | 0) + 7 * i) & 63;
        const f = rayLookback[u];
        f[0] = t; f[1] = r; f[2] = i;
      } else {
        const c = 192 & n;
        if (c === 0) {
          const h = 63 & n;
          const y = rayLookback[h];
          t = y[0]; r = y[1]; i = y[2];
        } else if (c === 64) {
          const p = 63 & n;
          const v = rayLookback[p];
          const b = v[0], w = v[1], _ = v[2];
          const g = rayData[dataPointer++];
          t = b + ((g >> 3) - 15);
          r = w + ((7 & g) - 3);
          i = _;
        } else if (c === 128) {
          const R2 = 63 & n;
          const C2 = rayLookback[R2];
          const I2 = C2[0], P2 = C2[1], k2 = C2[2];
          t = I2 + (rayData[dataPointer++] - 127);
          r = P2;
          i = k2;
        } else {
          const A = rayData[dataPointer++];
          const F = rayData[dataPointer++];
          t = (A << 2) | (F >> 6);
          r = 63 & F;
          i = 63 & n;
          const D = (3 * ((t / 128) | 0) + 5 * ((r / 16) | 0) + 7 * i) & 63;
          const E = rayLookback[D];
          E[0] = t; E[1] = r; E[2] = i;
        }
      }

      sampleOffset %= 2 * width * height;
      const index = samplePositionBuffer[sampleOffset++] + samplePositionBuffer[sampleOffset++] * width;
      output[index] = [t / 1023, r / 63, i];
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let idx = 0; idx < output.length; idx++) {
    const ray = output[idx];
    const x = idx % width;
    const y = height - 1 - Math.floor(idx / width);
    const px = (y * width + x) * 4;
    let cr: number, cg: number, cb: number;
    if (!ray) {
      // untouched sample — leave as sky so gaps don't flash black
      cr = 208; cg = 230; cb = 252;
    } else {
      const distance = ray[0];
      const alignment = ray[1];
      const material = ray[2];
      if (distance === 1 && alignment === 0 && material === 0) {
        cr = 208; cg = 230; cb = 252;
      } else {
        const colour = MATERIAL_COLOURS[material] || MATERIAL_COLOURS[0];
        cr = alignment * colour[0] * 255;
        cg = alignment * colour[1] * 255;
        cb = alignment * colour[2] * 255;
      }
    }
    data[px] = cr; data[px + 1] = cg; data[px + 2] = cb; data[px + 3] = 255;
  }

  return new ImageData(data, width, height);
}

/** Rust+ camera control button bitmask values (from rustplus.js Camera). */
export const CAMERA_BUTTONS = {
  NONE: 0,
  FORWARD: 2,
  BACKWARD: 4,
  LEFT: 8,
  RIGHT: 16,
  JUMP: 32,
  DUCK: 64,
  SPRINT: 128,
  USE: 256,
  FIRE_PRIMARY: 1024,
  FIRE_SECONDARY: 2048,
  RELOAD: 8192,
  FIRE_THIRD: 134217728,
} as const;
