import assert from 'node:assert/strict';
import test from 'node:test';
import { clampSpatialInput, orientationToSpatialInput } from '../src/utils/spatialRenderer.js';
import { resizeSpatialPixels } from '../src/utils/spatialPixels.js';

test('spatial input rejects invalid sensor readings and bounds extreme movement', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined]) assert.equal(clampSpatialInput(value), 0);
  assert.equal(clampSpatialInput(42), 1);
  assert.equal(clampSpatialInput(-42), -1);
  assert.equal(clampSpatialInput(0.4), 0.4);
});

test('canvas-free resizing preserves channel order, endpoints, and interpolated colors', () => {
  const input = new Uint8ClampedArray([0, 10, 20, 255, 100, 110, 120, 255]);
  assert.deepEqual([...resizeSpatialPixels(input, 2, 1, 4, 1, 1)], [50, 60, 70, 255]);
  const expanded = resizeSpatialPixels(input, 2, 1, 4, 4, 2);
  assert.deepEqual([...expanded.slice(0, 4)], [0, 10, 20, 255]);
  assert.deepEqual([...expanded.slice(-4)], [100, 110, 120, 255]);
  assert.deepEqual([...input], [0, 10, 20, 255, 100, 110, 120, 255], 'Input should not be mutated');
  assert.deepEqual([...resizeSpatialPixels(new Uint8Array([99]), 1, 1, 1, 2, 2)], [99, 99, 99, 99]);
});

test('orientation uses the resting pose and follows screen rotation', () => {
  const baseline = { beta: 65, gamma: 7 };
  assert.deepEqual(orientationToSpatialInput(65, 7, baseline), { x: 0, y: 0 });
  assert.deepEqual(orientationToSpatialInput(74, 16, baseline), { x: 0.5, y: 0.5 });
  const landscape = orientationToSpatialInput(83, 7, baseline, 90);
  assert.ok(Math.abs(landscape.x - 1) < 1e-8);
  assert.ok(Math.abs(landscape.y) < 1e-8);
  const inverted = orientationToSpatialInput(83, 7, baseline, 180);
  assert.ok(Math.abs(inverted.y + 1) < 1e-8);
  const crossedBoundary = orientationToSpatialInput(-179, 0, { beta: 179, gamma: 0 });
  assert.ok(Math.abs(crossedBoundary.y - 2 / 18) < 1e-8, 'Crossing the angle boundary should not jerk to the maximum offset');
});
