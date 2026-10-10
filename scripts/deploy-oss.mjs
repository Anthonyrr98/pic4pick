import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OSS from 'ali-oss';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const dryRun = process.argv.includes('--dry-run');
const bucket = process.env.OSS_FRONTEND_BUCKET;
const region = process.env.OSS_FRONTEND_REGION || 'oss-cn-beijing';

// Require a separate, explicit destination. Never infer it from the photo bucket.
if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error('Set OSS_FRONTEND_BUCKET to the dedicated frontend bucket.');
}
if (bucket === process.env.ALIYUN_OSS_BUCKET || bucket === 'pic4pick') {
  throw new Error('The photo bucket cannot be used as the frontend destination.');
}
if (!/^oss-cn-[a-z0-9-]+$/.test(region)) {
  throw new Error('OSS_FRONTEND_REGION must be an OSS region such as oss-cn-beijing.');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function collect(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = `${prefix}${entry.name}`;
    if (entry.name.startsWith('.') || key === 'CNAME') continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${key}`);
    if (entry.isDirectory()) {
      files.push(...await collect(path.join(directory, entry.name), `${key}/`));
    } else if (entry.isFile()) {
      if (!mimeTypes[path.extname(key)]) throw new Error(`Unexpected build file: ${key}`);
      files.push(key);
    }
  }
  return files;
}

if (!(await lstat(dist)).isDirectory()) throw new Error('Run npm run build first.');
const files = await collect(dist);
if (!files.includes('index.html')) throw new Error('Build is missing index.html.');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)) {
  if (!files.includes(match[1])) throw new Error(`Missing entry asset: ${match[1]}`);
}

function headersFor(key) {
  // Vite hashes assets; keep old assets so open tabs survive a release.
  const immutable = /^assets\/.*-[\w-]{8,}\.[a-z0-9]+$/.test(key);
  return {
    'Content-Type': mimeTypes[path.extname(key)],
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
}

console.log(`Frontend destination: oss://${bucket}/ (${region})`);
console.log(`Validated ${files.length} files. HTML will be published last; no remote objects will be deleted.`);
async function publish() {
  if (dryRun) {
    console.log('Dry run complete. No cloud credentials or writes were used.');
  } else {
    const accessKeyId = process.env.OSS_DEPLOY_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_DEPLOY_ACCESS_KEY_SECRET;
    if (!accessKeyId || !accessKeySecret) throw new Error('Set OSS_DEPLOY_ACCESS_KEY_ID and OSS_DEPLOY_ACCESS_KEY_SECRET.');
    const client = new OSS({
      bucket, region, accessKeyId, accessKeySecret,
      stsToken: process.env.OSS_DEPLOY_SECURITY_TOKEN || undefined,
      secure: true,
      timeout: 120_000,
    });
    const info = await client.getBucketInfo(bucket);
    if (info.bucket.Location !== region) throw new Error('Bucket region does not match OSS_FRONTEND_REGION.');
    const acl = info.bucket.AccessControlList?.Grant;
    if (acl === 'public-read-write') throw new Error('Refusing to deploy to a publicly writable bucket.');

    const website = await client.getBucketWebsite(bucket);
    if (website.index !== 'index.html') throw new Error('Configure the bucket website default index as index.html first.');

    const assets = files.filter(key => !key.endsWith('.html'));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, assets.length) }, async () => {
      while (next < assets.length) {
        const key = assets[next++];
        await client.put(key, path.join(dist, key), { headers: headersFor(key) });
      }
    }));
    for (const key of files.filter(key => key.endsWith('.html') && key !== 'index.html')) {
      await client.put(key, path.join(dist, key), { headers: headersFor(key) });
    }
    await client.put('index.html', path.join(dist, 'index.html'), { headers: headersFor('index.html') });
    const deployed = await client.get('index.html');
    if (!deployed.content.equals(Buffer.from(html))) throw new Error('Uploaded index.html does not match the build.');
    console.log(`Published and verified ${files.length} files. Refresh CDN / and /index.html after publishing.`);
  }
}

await publish().catch(error => {
  // SDK errors can contain signed URLs and request headers. Do not print them.
  console.error(error.code ? `OSS deployment failed (${error.code}, HTTP ${error.status || 'unknown'}). Check bucket permissions and configuration.` : error.message);
  process.exitCode = 1;
});
