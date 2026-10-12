import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createSpatialDepthClient } from '../src/utils/spatialDepthClient.js';

function fixture(options = {}) {
  const workers = [];
  const client = createSpatialDepthClient({ ...options, createWorker: () => {
    const worker = {
      messages: [], stopped: false,
      postMessage(message) { this.messages.push(message); },
      terminate() { this.stopped = true; },
      result(id = this.messages.at(-1).requestId) { this.onmessage({ data: { type: 'result', requestId: id, width: 1, height: 1, values: new Uint8Array([99]) } }); },
    };
    workers.push(worker);
    return worker;
  } });
  const request = (controller = new AbortController()) => client.request({ pixels: new ArrayBuffer(4) }, () => {}, controller.signal);
  return { workers, client, request };
}

test('different photos reuse one Worker and inference remains serial', async () => {
  const { workers, client, request } = fixture();
  try {
    const first = request();
    const second = request();
    assert.equal(workers.length, 1);
    assert.equal(workers[0].messages.length, 1);
    const firstId = workers[0].messages[0].requestId;
    workers[0].result(firstId);
    await first;
    assert.equal(workers[0].messages.length, 2);
    let secondFinished = false;
    second.then(() => { secondFinished = true; });
    workers[0].result(firstId);
    await Promise.resolve();
    assert.equal(secondFinished, false, 'An old response must not resolve the next photo');
    workers[0].result();
    await second;
    assert.equal(workers[0].stopped, false);
  } finally { client.release(); }
});

test('cancelling a queued photo leaves inference running, cancelling the active photo resets the Worker', async () => {
  const { workers, client, request } = fixture();
  try {
    const firstController = new AbortController();
    const queuedController = new AbortController();
    const first = request(firstController);
    const second = request();
    const queued = request(queuedController);
    const queuedRejected = assert.rejects(queued, { name: 'AbortError' });
    queuedController.abort();
    await queuedRejected;
    assert.equal(workers[0].stopped, false);
    const firstRejected = assert.rejects(first, { name: 'AbortError' });
    firstController.abort();
    await firstRejected;
    assert.equal(workers[0].stopped, true);
    assert.equal(workers.length, 2);
    workers[0].result();
    workers[1].result();
    await second;
  } finally { client.release(); }
});

test('idle models and stuck requests are released, then a fresh request can recover', async () => {
  const { workers, client, request } = fixture({ idleMs: 10, timeoutMs: 25 });
  try {
    const first = request();
    workers[0].result();
    await first;
    await delay(40);
    assert.equal(workers[0].stopped, true);
    await assert.rejects(request(), /生成超时/);
    assert.equal(workers[1].stopped, true);
    const retry = request();
    workers[2].result();
    await retry;
  } finally { client.release(); }
});

test('page release cancels active and queued work without orphan promises', async () => {
  const { workers, client, request } = fixture();
  const first = assert.rejects(request(), { name: 'AbortError' });
  const second = assert.rejects(request(), { name: 'AbortError' });
  client.release();
  await Promise.all([first, second]);
  assert.equal(workers[0].stopped, true);
  const resumed = request();
  workers[1].result();
  await resumed;
  client.release();
});

test('cancellation from a progress callback does not post pixels to a retired Worker', async () => {
  const { workers, client } = fixture();
  const controller = new AbortController();
  await assert.rejects(client.request({ pixels: new ArrayBuffer(4) }, () => controller.abort(), controller.signal), { name: 'AbortError' });
  assert.equal(workers[0].stopped, true);
  assert.equal(workers[0].messages.length, 0);
  client.release();
});
