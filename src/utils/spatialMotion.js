import { clampSpatialInput } from '../../packages/shared/spatialCore.js';

// Exponential smoothing has the same response at 60, 90 and 120 Hz. Limit a
// single step after a stalled frame so the picture cannot suddenly jump.
export function spatialSmoothingAlpha(deltaMs, timeConstantMs = 120) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || !Number.isFinite(timeConstantMs) || timeConstantMs <= 0) return 0;
  return -Math.expm1(-Math.min(deltaMs, 64) / timeConstantMs);
}

const smoothRange = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

// Inspect a small grid once per image. This measures depth discontinuities,
// not subject categories, and never modifies the model's depth pixels.
export function getSpatialMotionProfile({ values, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || values?.length !== width * height) {
    return { strength: 0.85, edgeDensity: 0, depthRange: 0 };
  }
  const stride = Math.max(1, Math.ceil(Math.max(width, height) / 128));
  const histogram = new Uint32Array(256);
  let samples = 0, comparisons = 0, edges = 0, strongEdges = 0;
  const compare = (a, b) => {
    const delta = Math.abs(a - b);
    comparisons++;
    if (delta >= 24) edges++;
    if (delta >= 64) strongEdges++;
  };
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = y * width + x, value = values[index];
      histogram[value]++;
      samples++;
      if (x + stride < width) compare(value, values[index + stride]);
      if (y + stride < height) compare(value, values[index + stride * width]);
    }
  }
  const percentile = (fraction) => {
    let count = 0;
    for (let i = 0; i < histogram.length; i++) {
      count += histogram[i];
      if (count >= Math.ceil(samples * fraction)) return i;
    }
    return 255;
  };
  const edgeDensity = comparisons ? edges / comparisons : 0;
  const strongDensity = comparisons ? strongEdges / comparisons : 0;
  const depthRange = (percentile(0.95) - percentile(0.05)) / 255;
  const edgeRisk = Math.max(smoothRange(0.02, 0.10, edgeDensity), smoothRange(0.005, 0.04, strongDensity));
  const shallowScale = 0.85 + 0.15 * smoothRange(0.04, 0.20, depthRange);
  return { strength: Math.max(0.75, (1 - 0.25 * edgeRisk) * shallowScale), edgeDensity, depthRange };
}

export function createSpatialOrientationFilter() {
  let previous = { x: 0, y: 0 };
  const deadzone = (value) => Math.sign(value) * Math.max(0, (Math.abs(clampSpatialInput(value)) - 0.02) / 0.98);
  return {
    sample(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const next = { x: deadzone(x), y: deadzone(y) };
      // Compare against the last accepted pose so slow deliberate movement
      // accumulates rather than disappearing between individual sensor events.
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.012) return null;
      previous = next;
      return next;
    },
    reset() { previous = { x: 0, y: 0 }; },
  };
}
