import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await readFile(new URL('../Sources/Pic4Pick/Resources/GalleryShared.js', import.meta.url), 'utf8');
const context = vm.createContext({ __pic4pickParseURL(value, base) {
  const url = new URL(value, base);
  return { protocol: url.protocol, hostname: url.hostname, host: url.host, pathname: url.pathname, hash: url.hash, query: [...url.searchParams] };
} }); vm.runInContext(bundle, context);
const canonical = await build({ bundle: true, write: false, format: 'iife', globalName: 'Canonical', target: 'es2020', stdin: {
  contents: `export { buildCityPhotoMap, buildCurationGroups, buildPhotosByLocation } from './packages/shared/photoDataUtils';
    export { mapSupabaseRowToGalleryPhoto } from './packages/shared/photoMapper';`, resolveDir: root,
} });
const baseline = vm.createContext({}); vm.runInContext(canonical.outputFiles[0].text, baseline);
let live = [];
try { live = JSON.parse(await readFile(new URL('../../.artifacts/ios-live-photos.json', import.meta.url))); } catch {}
const fixtures = [
  { id: 'beijing', country: '北京', location: '北京', latitude: 39.9, longitude: 116.4, shot_date: '2025-01-01' },
  { id: 'hangzhou', country: '浙江', location: '杭州', latitude: 30.25, longitude: 120.15, film_stock: 'Fuji C200' },
  { id: 'shanghai', country: '上海', location: '上海', latitude: 31.23, longitude: 121.47 },
].map(row => ({ ...row, image_url: 'https://example.com/photo.jpg', category: 'latest', tags: '', hidden: false, status: 'approved', created_at: '2026-01-01T00:00:00Z' }));
for (const rows of [fixtures, live].filter(rows => rows.length)) {
  const result = JSON.parse(context.Pic4PickShared.catalog(rows));
  const photos = rows.map(baseline.Canonical.mapSupabaseRowToGalleryPhoto);
  const expected = JSON.parse(JSON.stringify(baseline.Canonical.buildCurationGroups(baseline.Canonical.buildCityPhotoMap(photos))));
  assert.deepEqual(result.provinces.map(group => [group.id, group.totalCount, group.cities.map(city => [city.id, city.photoIDs])]),
    expected.map(group => [group.id, group.totalCount, group.items.map(city => [city.id, city.photos.map(photo => photo.id)])]));
  assert.equal(result.locations.length, baseline.Canonical.buildPhotosByLocation(photos).length);
  assert.equal(Object.keys(result.summaries).length, rows.length);
  console.log(JSON.stringify({ checkedPhotos: rows.length, provinces: result.provinces.length, cities: result.provinces.reduce((sum, p) => sum + p.cities.length, 0), sharedRulesMatchWebsite: true }));
  if (rows === live) await writeFile(new URL('../../.artifacts/ios-parity-catalog.json', import.meta.url), JSON.stringify(result));
}
const summary = JSON.parse(context.Pic4PickShared.details(fixtures[0]));
assert.equal(summary.badge, '最新'); assert.ok(summary.shot.dateText.includes('2025'));
const media = JSON.parse(context.Pic4PickShared.media({ ...fixtures[0], image_url: 'https://example.oss-cn-beijing.aliyuncs.com/ore/2026/photo.jpg', thumbnail_url: '' }, true));
assert.ok(media.original.includes('/origin/2026/photo.jpg')); assert.ok(media.candidates.length > 1);
const presets = JSON.parse(await readFile(new URL('../Sources/Pic4Pick/Resources/AdminMapPresets.json', import.meta.url)));
assert.equal(presets.length, 14);
console.log('通过：城市归类、地点聚合、日期与标签共享规则及全部 14 种地图预设。');
