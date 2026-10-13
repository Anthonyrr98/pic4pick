import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpatialOssClient, uploadSpatialDepth } from '../../server/spatialDepthStorage.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Existing server credentials stay in this local process, never in VITE_*.
for (const line of (await readFile(path.join(root, 'server/.env'), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = db.storage.from('spatial-depth');
const spatialOss = createSpatialOssClient();
const workdir = path.join(root, '.artifacts/spatial-worker');
await mkdir(workdir, { recursive: true });
const lock = path.join(workdir, 'worker.lock');
try {
  const previous = Number(await readFile(lock, 'utf8'));
  try { process.kill(previous, 0); throw new Error(`Spatial GPU worker is already running (PID ${previous})`); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  await unlink(lock);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(lock, String(process.pid), { flag: 'wx' });
const log = (message, detail = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), message, ...detail });
  appendFileSync(path.join(workdir, 'activity.jsonl'), `${line}\n`);
  console.log(line);
};
const python = process.env.SPATIAL_PYTHON || path.join(root, '.artifacts/spatial-compare/.gpu-venv/Scripts/python.exe');
let child, pending, stopped = false, lastJobAt = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rpc = async (name, args = {}) => {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
};
const stopModel = () => { child?.kill(); child = null; };
const stop = () => { stopped = true; stopModel(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function startModel() {
  if (child) return;
  const current = spawn(python, [path.join(root, 'scripts/spatial-gpu/inference.py')], {
    cwd: root, env: { ...process.env, PYTHONUTF8: '1' }, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child = current;
  current.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { current.kill(); reject(new Error('GPU model startup timed out')); }, 180_000);
    current.on('error', (error) => { clearTimeout(timeout); reject(error); });
    current.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`GPU model process exited (${code})`));
      if (child === current) {
        child = null;
        pending?.reject(new Error('GPU model process exited'));
        pending = null;
      }
    });
    createInterface({ input: current.stdout }).on('line', (line) => {
      let data;
      try { data = JSON.parse(line); } catch { process.stderr.write(`${line}\n`); return; }
      if (data.type === 'ready') { clearTimeout(timeout); resolve(); log('GPU model ready', { gpu: data.gpu, model: data.model }); }
      else if (pending && data.id === pending.id) {
        const request = pending;
        pending = null;
        if (data.type === 'result') request.resolve(data);
        else request.reject(new Error(data.message || 'GPU inference failed'));
      }
    });
  });
  await ready;
}
async function infer(id, filename) {
  await startModel();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { stopModel(); reject(new Error('GPU inference timed out')); pending = null; }, 120_000);
    pending = { id, resolve: (result) => { clearTimeout(timeout); resolve(result); }, reject: (error) => { clearTimeout(timeout); reject(error); } };
    child.stdin.write(JSON.stringify({ id, path: filename }) + '\n', (error) => { if (error) pending?.reject(error); });
  });
}
const allowedHosts = new Set((process.env.SPATIAL_IMAGE_HOSTS || `${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`).split(',').map((s) => s.trim()));
async function downloadImage(source) {
  const parsed = new URL(source);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHosts.has(parsed.hostname)
    || !/^\/(origin|ore|pic4pick)\//.test(parsed.pathname)) throw new Error('Image URL is outside configured photo storage');
  const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) throw new Error(`Photo read failed (${response.status})`);
  if (Number(response.headers.get('content-length')) > 50 * 1024 * 1024) throw new Error('Photo exceeds 50 MiB');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 50 * 1024 * 1024) { await reader.cancel(); throw new Error('Photo exceeds 50 MiB'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// The bucket is private. Collect only unreferenced, old objects; a newer upload
// may be between Storage upload and the database commit and must be retained.
async function cleanupOldDepths() {
  const { data: rows, error } = await db.from('photo_spatial').select('depth_path');
  if (error) throw new Error(error.message);
  const referenced = new Set(rows.map((row) => row.depth_path).filter(Boolean));
  // Keep legacy copies during migration. Only collect OSS objects older than
  // the upload/commit window and outside every currently referenced generation.
  let marker;
  const staleKeys = [];
  do {
    const page = await spatialOss.list({ prefix: 'spatial-depth/', 'max-keys': 1000, marker });
    for (const object of page.objects || []) {
      const relative = object.name.slice('spatial-depth/'.length);
      if (/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/.test(relative)
        && Date.now() - Date.parse(object.lastModified) > 3600_000 && !referenced.has(relative)) staleKeys.push(object.name);
    }
    marker = page.isTruncated ? page.nextMarker : undefined;
  } while (marker);
  for (const key of staleKeys) await spatialOss.delete(key);
  if (staleKeys.length) log('Removed orphan OSS depth assets', { count: staleKeys.length });
  for (let offset = 0;; offset += 100) {
    const { data: folders, error: folderError } = await bucket.list('', { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (folderError) throw new Error(folderError.message);
    for (const folder of folders) {
      if (!/^[a-f0-9-]{36}$/.test(folder.name)) continue;
      const { data: objects, error: objectError } = await bucket.list(folder.name, { limit: 100 });
      if (objectError) throw new Error(objectError.message);
      const stale = objects.filter((item) => /^[a-f0-9-]{36}\.png$/.test(item.name)
        && Date.now() - Date.parse(item.created_at) > 3600_000
        && !referenced.has(`${folder.name}/${item.name}`)).map((item) => `${folder.name}/${item.name}`);
      if (stale.length) {
        const result = await bucket.remove(stale);
        if (result.error) throw new Error(result.error.message);
        log('Removed orphan depth assets', { count: stale.length });
      }
    }
    if (folders.length < 100) break;
  }
}
let lastCleanup = 0;
try {
  log('Spatial worker started', { pid: process.pid });
  while (!stopped) {
    try {
      if (Date.now() - lastCleanup > 3600_000) { await cleanupOldDepths(); lastCleanup = Date.now(); }
      const job = await rpc('claim_spatial_job');
      if (!job) {
        if (child && Date.now() - lastJobAt > 60_000) { stopModel(); log('GPU model released while idle'); }
        if (process.argv.includes('--once')) break;
        await sleep(child ? 5000 : 30_000);
        continue;
      }
      lastJobAt = Date.now();
      const filename = path.join(workdir, `${job.generation}.image`);
      const start = Date.now();
      try {
        // Infer from the original; input normalization matches the comparison.
        await writeFile(filename, await downloadImage(job.image_url));
        const prediction = await infer(job.generation, filename);
        const png = Buffer.from(prediction.png, 'base64');
        if (png.length > 1048576) throw new Error('Depth result exceeds 1 MiB');
        await uploadSpatialDepth(spatialOss, job.photo_id, job.generation, png);
        const completed = await rpc('complete_spatial_job_oss', { p_photo_id: job.photo_id, p_generation: job.generation,
          p_lease_token: job.lease_token, p_width: prediction.width, p_height: prediction.height });
        if (!completed) {
          // An expired lease may have been taken by another worker for the same
          // generation. Retain the object until the orphan sweeper can decide.
          log('Stale generation or lease; result was not published', { photoId: job.photo_id });
        } else log('Spatial photo ready', { photoId: job.photo_id, seconds: (Date.now() - start) / 1000,
          inferenceSeconds: prediction.seconds, bytes: png.length, peakAllocatedGiB: prediction.peak_allocated_bytes / 2 ** 30 });
      } catch (error) {
        stopModel();
        const message = error.code ? `Storage error: ${error.code}` : error.message;
        log('Spatial job failed; queued for retry', { photoId: job.photo_id, error: message });
        await rpc('fail_spatial_job', { p_photo_id: job.photo_id, p_generation: job.generation, p_lease_token: job.lease_token, p_error: message });
      } finally { await unlink(filename).catch(() => {}); }
      lastJobAt = Date.now();
      if (process.argv.includes('--once')) break;
    } catch (error) { log('Worker connection failed', { error: error.code || error.message }); if (process.argv.includes('--once')) throw error; await sleep(15_000); }
  }
} finally {
  stopModel();
  await unlink(lock).catch(() => {});
}
