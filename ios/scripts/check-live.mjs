import { readFile, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../Sources/Pic4Pick/Resources/ClientConfig.json', import.meta.url)));
const headers = { apikey: config.publicKey, 'Accept-Profile': 'public',
  ...(!config.publicKey.startsWith('sb_publishable_') ? { Authorization: `Bearer ${config.publicKey}` } : {}) };
const url = new URL(config.supabaseURL + '/rest/v1/photos');
url.search = new URLSearchParams({ select: 'id,title,location,country,category,tags,image_url,thumbnail_url,latitude,longitude,camera,lens,focal,aperture,shutter,iso,film_stock,shot_date,created_at,status,hidden,likes',
  status: 'eq.approved', hidden: 'eq.false', limit: '1000', order: 'created_at.desc' });
let response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
let rows = await response.json();
if (!response.ok && rows.code === '57014') {
  url.searchParams.delete('order');
  response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) }); rows = await response.json();
}
if (!response.ok || !Array.isArray(rows)) throw new Error(`公开图库请求失败: ${response.status} ${rows.message}`);
if (!rows.every(row => row.status === 'approved' && row.hidden === false)) throw new Error('返回了非公开作品');
console.log(JSON.stringify({ status: response.status, photos: rows.length, allPublic: true,
  filmStocks: [...new Set(rows.map(row => row.film_stock).filter(Boolean))] }));
await writeFile(new URL('../../.artifacts/ios-live-photos.json', import.meta.url), JSON.stringify(rows));
for (const photo of rows.slice(0, 3)) {
  const image = await fetch(photo.thumbnail_url || photo.image_url, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  console.log(JSON.stringify({ imageStatus: image.status, contentType: image.headers.get('content-type') }));
  if (!image.ok) throw new Error('线上图片无法读取');
}
for (const [name, path] of [['website', config.websiteURL], ['backend', config.apiBaseURL + '/api/health']]) {
  const result = await fetch(path, { signal: AbortSignal.timeout(60000) });
  console.log(JSON.stringify({ [name]: result.status }));
  if (!result.ok) throw new Error(`${name} 无法访问`);
}
