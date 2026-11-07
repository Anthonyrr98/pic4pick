import { readFile, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../Sources/Pic4Pick/Resources/ClientConfig.json', import.meta.url)));
const headers = { apikey: config.publicKey, 'Accept-Profile': 'public',
  ...(!config.publicKey.startsWith('sb_publishable_') ? { Authorization: `Bearer ${config.publicKey}` } : {}) };
const base = config.supabaseURL.replace(/\/$/, '');
const request = async (url, extra = {}) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(65000), ...extra });
  if (!response.ok) throw new Error(`空间数据请求失败 (${response.status})`);
  return response;
};
const url = new URL(base + '/rest/v1/photo_spatial');
url.search = new URLSearchParams({ select: 'photo_id,generation,status,storage_backend,depth_path,width,height', limit: '1000' });
const rows = await (await request(url, { headers })).json();
if (!Array.isArray(rows)) throw new Error('景深元数据不是数组');
await writeFile(new URL('../../.artifacts/ios-spatial-metadata.json', import.meta.url), JSON.stringify(rows));
const counts = Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length]));
console.log(JSON.stringify({ metadata: rows.length, statuses: counts }));
const ready = rows.filter(row => row.status === 'ready' && row.storage_backend === 'oss');
if (!ready.length) throw new Error('尚无可验证的 OSS 景深');
const samples = [...new Map([ready[0], ready.find(row => row.height > row.width), ready.at(-1)]
  .filter(Boolean).map(row => [row.photo_id, row])).values()];
for (const row of samples) {
  const signature = await (await request(config.apiBaseURL + `/api/photos/${row.photo_id}/spatial-depth`)).json();
  if (signature.generation !== row.generation || !signature.signedUrl.startsWith('https://')) throw new Error('景深签名版本或协议错误');
  const data = Buffer.from(await (await request(signature.signedUrl)).arrayBuffer());
  if (data.length > 1048576 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('景深 PNG 无效');
  if (data.readUInt32BE(16) !== row.width || data.readUInt32BE(20) !== row.height) throw new Error('景深尺寸错误');
  // Do not print signed URLs, even on failure.
  console.log(JSON.stringify({ depth: row.photo_id, size: [row.width, row.height], bytes: data.length, expiresIn: signature.expiresIn }));
}
