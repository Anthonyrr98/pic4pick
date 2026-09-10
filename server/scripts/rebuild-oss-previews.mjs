import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import OSS from 'ali-oss';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, '..', '.env') });

const apply = process.argv.includes('--apply');
const MAX_OSS_PROCESS_BYTES = 20 * 1024 * 1024;
const required = [
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ACCESS_KEY_ID',
  'ALIYUN_OSS_ACCESS_KEY_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

const oss = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  timeout: 5 * 60 * 1000,
});

const supabaseHeaders = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Accept-Profile': 'public',
  'Content-Profile': 'public',
  'Content-Type': 'application/json',
};

const objectInfo = (url) => {
  try {
    const parsed = new URL(url);
    return { parsed, key: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) };
  } catch {
    return null;
  }
};

const publicUrlForKey = (key, sourceUrl) => {
  const parsed = new URL(sourceUrl);
  parsed.pathname = `/${key}`;
  parsed.search = '';
  return parsed.toString();
};

const response = await fetch(
  `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/photos?select=id,title,image_url,thumbnail_url&status=eq.approved`,
  { headers: supabaseHeaders }
);
if (!response.ok) throw new Error(`Supabase scan failed: ${response.status} ${await response.text()}`);

const photos = await response.json();
const candidates = [];

for (const photo of photos) {
  const existingPreview = objectInfo(photo.thumbnail_url || '');
  if (existingPreview?.key && /^ore\/hd\//i.test(existingPreview.key)) {
    try {
      await oss.head(existingPreview.key);
      continue;
    } catch {
      console.warn(`${photo.title || photo.id}: referenced HD preview is missing; rebuilding`);
    }
  }

  const source = objectInfo(photo.image_url || photo.thumbnail_url || '');
  if (!source || !/\.aliyuncs\.com$/i.test(source.parsed.hostname)) continue;

  const originKey = source.key.replace(/^ore\/hd\//i, 'origin/').replace(/^ore\//i, 'origin/');
  if (!originKey.startsWith('origin/')) continue;

  try {
    const head = await oss.head(originKey);
    const size = Number(head.res?.headers?.['content-length'] || 0);
    const legacyImagePointsToThumbnail = /^ore\//i.test(source.key);
    if (size > MAX_OSS_PROCESS_BYTES || legacyImagePointsToThumbnail) {
      candidates.push({ photo, originKey, size, sourceUrl: source.parsed.toString() });
    }
  } catch (error) {
    console.warn(`skip ${photo.title || photo.id}: origin object unavailable (${error.code || error.message})`);
  }
}

console.log(`${apply ? 'apply' : 'dry-run'}: ${candidates.length} photo(s) need HD previews`);
for (const item of candidates) {
  console.log(`- ${item.photo.title || item.photo.id}: ${(item.size / 1024 / 1024).toFixed(2)} MB`);
}

if (!apply) process.exit(0);

for (const item of candidates) {
  const origin = await oss.get(item.originKey);
  const previewBuffer = await sharp(origin.content)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const relativeKey = item.originKey.replace(/^origin\//i, '');
  const previewKey = `ore/hd/${relativeKey.replace(/\.[^.]+$/, '.jpg')}`;
  await oss.put(previewKey, previewBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-oss-object-acl': 'public-read',
    },
  });

  const imageUrl = publicUrlForKey(item.originKey, item.sourceUrl);
  const thumbnailUrl = publicUrlForKey(previewKey, item.sourceUrl);
  const patchResponse = await fetch(
    `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/photos?id=eq.${encodeURIComponent(item.photo.id)}`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ image_url: imageUrl, thumbnail_url: thumbnailUrl }),
    }
  );
  if (!patchResponse.ok) {
    throw new Error(`Supabase update failed for ${item.photo.id}: ${patchResponse.status} ${await patchResponse.text()}`);
  }
  console.log(`updated ${item.photo.title || item.photo.id}: ${(previewBuffer.length / 1024 / 1024).toFixed(2)} MB`);
}
