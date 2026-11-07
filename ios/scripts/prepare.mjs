import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = {};
for (const file of ['.env.local', '.env.production', 'miniapp/.env.local']) {
  try {
    for (const line of (await readFile(path.join(root, file), 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const get = name => process.env[`PIC4PICK_${name}`] || env[`PIC4PICK_${name}`] || env[`VITE_${name}`] || '';
const config = {
  supabaseURL: get('SUPABASE_URL'), publicKey: get('SUPABASE_ANON_KEY'),
  apiBaseURL: get('API_BASE_URL').replace(/\/+$/, '').replace(/\/api$/, ''),
  websiteURL: process.env.PIC4PICK_WEBSITE_URL || 'https://pic.rlzhao.com',
  mediaBaseURL: get('MEDIA_BASE_URL') || 'https://pic.rlzhao.com',
};
for (const name of ['supabaseURL', 'apiBaseURL', 'websiteURL', 'mediaBaseURL']) {
  if (new URL(config[name]).protocol !== 'https:') throw new Error(`${name} 必须是 HTTPS`);
}
let isPublic = config.publicKey.startsWith('sb_publishable_');
if (!isPublic) {
  try { isPublic = JSON.parse(Buffer.from(config.publicKey.split('.')[1], 'base64url')).role === 'anon'; } catch {}
}
if (!isPublic) throw new Error('只允许 Supabase publishable 或 anon key；拒绝打包服务端密钥');
const resources = path.join(root, 'ios/Sources/Pic4Pick/Resources');
await mkdir(resources, { recursive: true });
await writeFile(path.join(resources, 'ClientConfig.json'), JSON.stringify(config, null, 2) + '\n');
for (const name of ['135-landscape', '135-portrait', 'fuji-c200', 'kodak-gold-200', 'fuji-simple-ace']) {
  await copyFile(path.join(root, `public/film-frames/${name}.png`), path.join(resources, `${name}.png`));
}
console.log('已生成 iOS 公开客户端配置，并同步 5 张原始胶片边框。');
const { MAP_STYLE_PRESETS } = await import(pathToFileURL(path.join(root, 'packages/shared/mapStylePresets.ts')).href);
await writeFile(path.join(resources, 'AdminMapPresets.json'), JSON.stringify(MAP_STYLE_PRESETS.map(
  ({ id, label, kind, rasterStyle, amapStyle }) => ({ id, label, kind, rasterStyle, amapStyle })), null, 2) + '\n');
const mapConfig = Object.fromEntries(['VITE_AMAP_WEB_KEY', 'VITE_AMAP_KEY', 'VITE_AMAP_SECURITY_JS_CODE',
  'VITE_MAP_STYLE_PRESET', 'VITE_MAP_USE_AMAP_SDK', 'VITE_AMAP_MAP_STYLE', 'VITE_GAODE_RASTER_STYLE']
  .map(key => [key, env[key] || '']));
await writeFile(path.join(resources, 'PublicMapConfig.json'), JSON.stringify(mapConfig));
const common = { bundle: true, write: false, minify: true, target: 'safari17', logLevel: 'warning' };
const shared = await build({ ...common, entryPoints: [path.join(root, 'ios/Web/GalleryShared.ts')], format: 'iife', globalName: 'Pic4PickShared' });
await writeFile(path.join(resources, 'GalleryShared.js'), shared.outputFiles[0].text);
const worker = await build({ ...common, entryPoints: [path.join(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')], format: 'iife' });
const map = await build({ ...common, entryPoints: [path.join(root, 'ios/Web/Map.ts')], format: 'iife',
  define: { __WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text), 'import.meta.url': JSON.stringify('https://pic.rlzhao.com/'), 'import.meta.env': '{}' } });
const css = await readFile(path.join(root, 'node_modules/maplibre-gl/dist/maplibre-gl.css'), 'utf8');
const template = await readFile(path.join(root, 'ios/Web/Map.html'), 'utf8');
await writeFile(path.join(resources, 'GalleryMap.html'), template.replace('__MAP_CSS__', () => css)
  .replace('__MAP_JS__', () => map.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
for (const [source, name] of [['public/loa-cropped.png', 'brand-wordmark.png'], ['public/images/film-desktop.png', 'film-desktop.png'],
  ['public/film-frames/35mm-controls.png', '35mm-controls.png'], ['public/images/cameras/nikon-fm2.png', 'nikon-fm2.png'],
  ['public/images/film-stocks/fuji-c200.png', 'fuji-c200-artwork.png']]) {
  await copyFile(path.join(root, source), path.join(resources, name));
}
await copyFile(path.join(root, 'node_modules/maplibre-gl/LICENSE.txt'), path.join(resources, 'MapLibre-LICENSE.txt'));
console.log('已生成共享城市规则、网站地图引擎、公开地图配置和胶片分区素材。');
