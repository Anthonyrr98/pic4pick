import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialOrientationFilter, getSpatialMotionProfile, spatialSmoothingAlpha } from '../src/utils/spatialMotion.js';
import { createSpatialRenderer } from '../src/utils/spatialRenderer.js';

const depthFixture = (width, height, pixel) => ({ width, height, values: Uint8Array.from({ length: width * height }, (_, i) => pixel(i % width, Math.floor(i / width))) });

test('equal elapsed time gives equal easing at 60, 90 and 120 Hz', () => {
  const positions = [60, 90, 120].map(hz => {
    let position = 0;
    for (let i = 0; i < hz / 2; i++) position += (1 - position) * spatialSmoothingAlpha(1000 / hz);
    return position;
  });
  for (const value of positions) assert.ok(Math.abs(value - positions[0]) < 1e-12);
  assert.equal(spatialSmoothingAlpha(0), 0);
  assert.equal(spatialSmoothingAlpha(NaN), 0);
  assert.ok(spatialSmoothingAlpha(10_000) < 0.5, 'A stalled frame must not jump to its destination');
});

test('complex depth edges reduce motion while smooth depth keeps the enlarged range', () => {
  const smooth = depthFixture(128, 128, x => x * 2);
  const complex = depthFixture(128, 128, (x, y) => (x + y) % 2 ? 255 : 0);
  const smoothProfile = getSpatialMotionProfile(smooth);
  const complexProfile = getSpatialMotionProfile(complex);
  assert.equal(smoothProfile.strength, 1);
  assert.ok(complexProfile.strength < smoothProfile.strength);
  assert.ok(complexProfile.strength >= 0.75, 'Keep at least 1.5x the original amplitude');
  assert.ok(getSpatialMotionProfile(depthFixture(128, 128, () => 120)).strength < 1, 'A nearly flat scene should not just slide as a whole');
  for (const depth of [smooth, complex, depthFixture(1, 1, () => 255), { values: [], width: 0, height: 0 }]) {
    const { strength } = getSpatialMotionProfile(depth);
    assert.ok(Number.isFinite(strength) && strength <= 1 && strength >= 0.75);
    assert.ok(0.024 * strength * 0.65 + 0.001 < (1 - 1 / 1.045) / 2, 'Worst-case shift stays inside the existing overscan');
  }
  assert.deepEqual(smooth, depthFixture(128, 128, x => x * 2), 'Profiling must preserve depth pixels');
});

test('orientation filter ignores stationary jitter, accepts slow movement and resets after recalibration', () => {
  const filter = createSpatialOrientationFilter();
  for (const value of [-0.015, 0.01, 0.019]) assert.equal(filter.sample(value, -value), null);
  assert.equal(filter.sample(Infinity, 0), null);
  const tilted = filter.sample(0.5, 0);
  assert.ok(tilted.x > 0.45 && tilted.x < 0.5);
  assert.equal(filter.sample(0.503, 0.001), null, 'Noise must also be suppressed away from the centre');
  let accepted = 0;
  for (let i = 1; i <= 40; i++) if (filter.sample(0.5 + i * 0.001, 0)) accepted++;
  assert.ok(accepted >= 2, 'Small deliberate changes must accumulate');
  assert.deepEqual(filter.sample(0, 0), { x: 0, y: 0 });
  filter.sample(0.8, 0.6);
  filter.reset();
  assert.equal(filter.sample(0, 0), null);
  assert.deepEqual(filter.sample(5, -5), { x: 1, y: -1 });
});

test('renderer uses elapsed time, returns exactly to centre and stops drawing when settled or hidden', t => {
  const globals = ['document', 'window', 'performance', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'];
  const originals = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  t.after(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const run = hz => {
    let clock = 0, id = 0, offset, disconnected = false;
    const frames = new Map(), listeners = new Map();
    const gl = new Proxy({
      getShaderParameter: () => true, getProgramParameter: () => true, getParameter: () => 2048,
      createProgram: () => ({}), createShader: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
      getUniformLocation: (_, name) => name, getAttribLocation: () => 0,
      uniform2f: (_, x, y) => { offset = [x, y]; },
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    const doc = { hidden: false, createElement: () => ({ getContext: () => ({ drawImage() {} }) }),
      addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const replacements = {
      document: doc, window: { devicePixelRatio: 1 }, performance: { now: () => clock },
      ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
      requestAnimationFrame: callback => { frames.set(++id, callback); return id; }, cancelAnimationFrame: key => frames.delete(key),
      getComputedStyle: () => ({ objectFit: 'contain' }),
    };
    for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const canvas = { style: {}, getContext: () => gl, parentElement: { clientWidth: 800, clientHeight: 600, querySelector: () => ({}) } };
    const renderer = createSpatialRenderer(canvas, { naturalWidth: 1600, naturalHeight: 1000 }, depthFixture(128, 128, x => x * 2));
    const step = time => { clock = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); };
    renderer.setTarget(1, 1);
    for (let i = 1; i <= hz / 2; i++) step(i * 1000 / hz);
    const atHalfSecond = [...offset];
    renderer.setTarget(0, 0, { returning: true });
    for (let i = 1; i <= hz * 2; i++) step(500 + i * 1000 / hz);
    assert.deepEqual(offset, [0, 0]);
    assert.equal(frames.size, 0, 'Settled scenes do not keep rendering');
    renderer.setTarget(-1, -1);
    doc.hidden = true; listeners.get('visibilitychange')();
    assert.equal(frames.size, 0);
    clock += 10_000;
    doc.hidden = false; listeners.get('visibilitychange')();
    step(clock + 1000 / hz);
    assert.ok(Math.abs(offset[0]) < 0.005, 'Returning to a tab must not jump across the image');
    renderer.dispose();
    assert.equal(frames.size, 0); assert.equal(listeners.size, 0); assert.equal(disconnected, true);
    return atHalfSecond;
  };
  const sixty = run(60), oneTwenty = run(120);
  sixty.forEach((value, index) => assert.ok(Math.abs(value - oneTwenty[index]) < 1e-10));
});
