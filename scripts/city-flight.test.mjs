import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCityFlight, getCityFocusOffset } from '../src/pages/gallery/utils/cityFlight.js';

const settings = { from: [116.35, 39.99], to: [121.47, 31.23], zoom: 10.2, width: 1146, height: 956 };
test('distant cities follow a finite, continuous zoom-out / zoom-in arc', () => {
  const flight = createCityFlight(settings);
  const frames = Array.from({ length: 121 }, (_, i) => flight.sample(i / 120));
  assert.deepEqual(frames[0], { center: settings.from, zoom: 10.2 });
  assert.ok(Math.min(...frames.map(f => f.zoom)) < 8);
  assert.equal(frames.at(-1).zoom, 10.2);
  assert.ok(Math.abs(frames.at(-1).center[0] - settings.to[0]) < 1e-8);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].center.every(Number.isFinite));
    assert.ok(Math.abs(frames[i].zoom - frames[i - 1].zoom) < 0.4);
    assert.ok(frames[i].center[0] >= frames[i - 1].center[0] - 1e-8);
  }
  assert.ok(flight.duration >= 1150 && flight.duration <= 3850);
});
test('the final approach slows progressively and settles without a last-frame snap', () => {
  const flight = createCityFlight(settings);
  const step = t => Math.abs(flight.sample(t + 0.01).zoom - flight.sample(t).zoom);
  assert.ok(step(0.9) < step(0.8) * 0.4);
  assert.ok(step(0.98) < step(0.9) * 0.05);
  assert.ok(Math.abs(flight.sample(0.99).zoom - flight.sample(1).zoom) < 0.001);
});
test('same-place zoom and a repeated settled selection remain stable', () => {
  const flight = createCityFlight({ ...settings, to: settings.from, zoom: 15 });
  assert.ok(flight.sample(0.5).zoom < 15);
  assert.equal(flight.sample(1).zoom, 10.2);
  assert.equal(createCityFlight({ ...settings, to: settings.from }).duration, 0);
});
test('date-line travel takes the short route and polar coordinates stay finite', () => {
  const flight = createCityFlight({ ...settings, from: [179.8, 80], to: [-179.8, 89] });
  for (let i = 0; i <= 20; i++) {
    const { center, zoom } = flight.sample(i / 20);
    assert.ok(center.every(Number.isFinite) && Number.isFinite(zoom));
    assert.ok(Math.abs(center[0]) > 170);
  }
});
test('desktop sidebar and mobile sheet leave the destination in the visible map', () => {
  const desktop = getCityFocusOffset({ left: 0, top: 0, width: 1146, height: 956 },
    { right: 480, top: 150, width: 450, height: 780 });
  assert.deepEqual(desktop, [240, 0]);
  const mobile = getCityFocusOffset({ left: 0, top: 0, width: 390, height: 844 },
    { right: 382, top: 557, width: 374, height: 280 });
  assert.deepEqual(mobile, [0, -143.5]);
  const desktopCamera = createCityFlight({ ...settings, offset: desktop }).sample(1);
  assert.ok(desktopCamera.center[0] < settings.to[0]);
  const mobileCamera = createCityFlight({ ...settings, offset: mobile }).sample(1);
  assert.ok(mobileCamera.center[1] < settings.to[1]);
});
