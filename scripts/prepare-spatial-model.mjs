import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execute = promisify(execFile);
const model = 'onnx-community/depth-anything-v2-small';
const revision = '0d8d94ea44f483e26c9c33dad1a97c453ef9b80c';
const destination = path.resolve('dist/spatial-models', model, 'resolve', revision);
const metadataPath = path.resolve('.artifacts/spatial/model-metadata.json');
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const download = async (url, target) => {
  const args = ['--location', '--fail', '--silent', '--show-error', '--max-time', '180'];
  if (process.env.SPATIAL_DOWNLOAD_PROXY) args.push('--proxy', process.env.SPATIAL_DOWNLOAD_PROXY);
  args.push('--output', target, url);
  try { await execute(curl, args); }
  catch { throw new Error('Spatial model download failed. Check the connection or SPATIAL_DOWNLOAD_PROXY.'); }
};

await mkdir(destination, { recursive: true });
await mkdir(path.dirname(metadataPath), { recursive: true });
await download(`https://huggingface.co/api/models/${model}/revision/${revision}?blobs=true`, metadataPath);
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
if (metadata.sha !== revision) throw new Error('Spatial model revision did not match.');
for (const name of ['config.json', 'preprocessor_config.json', 'onnx/model_quantized.onnx']) {
  const target = path.join(destination, name);
  await mkdir(path.dirname(target), { recursive: true });
  console.log(`Preparing spatial model: ${name}`);
  await download(`https://huggingface.co/${model}/resolve/${revision}/${name}`, target);
  const data = await readFile(target);
  const expected = metadata.siblings.find((item) => item.rfilename === name)?.lfs;
  if (name.endsWith('.onnx') && (!expected?.sha256 || data.length !== expected.size
    || createHash('sha256').update(data).digest('hex') !== expected.sha256)) {
    throw new Error('Spatial model size or checksum did not match.');
  }
  if (name.endsWith('.json')) JSON.parse(data.toString('utf8'));
}
await download('https://raw.githubusercontent.com/DepthAnything/Depth-Anything-V2/main/LICENSE', path.join(destination, 'LICENSE.txt'));
await writeFile(path.join(destination, 'NOTICE.txt'), `Depth Anything V2 Small (q8 ONNX)\nSource: https://huggingface.co/${model}\nRevision: ${revision}\nLicense: Apache-2.0\nModel authors: Depth Anything V2; ONNX conversion: ONNX Community.\n`);
console.log('Spatial model prepared and checksum verified.');
