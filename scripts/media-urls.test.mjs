import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createMediaUrlHelpers } from '../packages/shared/mediaUrls.js';

const origin = 'https://photos.oss-cn-beijing.aliyuncs.com/origin/2026/10/22/photo.jpg';

test('media adapters keep direct, relative and embedded images and unwrap historic proxy URLs', () => {
  const media = createMediaUrlHelpers();
  assert.equal(media.ensureHttps('http://example.com/photo.jpg'), 'https://example.com/photo.jpg');
  assert.equal(media.resolveMediaUrl('/local/photo.jpg'), '/local/photo.jpg');
  assert.equal(media.resolveMediaUrl('data:image/png;base64,AA=='), 'data:image/png;base64,AA==');
  assert.equal(media.resolveMediaUrl(`/api/media/proxy?url=${encodeURIComponent(origin)}`), origin);
});

test('detail and download recover the original while responsive previews retain their requested dimensions', () => {
  const media = createMediaUrlHelpers();
  const oldThumbnail = origin.replace('/origin/', '/ore/');
  assert.equal(media.getOriginalMediaUrl({ image: oldThumbnail }), origin);
  const detail = new URL(media.getPreviewMediaUrl({ image: oldThumbnail }, { preferOriginal: true, width: 2000, quality: 92 }));
  assert.equal(detail.pathname, new URL(origin).pathname);
  assert.match(detail.searchParams.get('x-oss-process'), /resize,w_2000.*quality,q_92/);
  assert.match(media.getPreviewMediaSrcSet({ image: origin }, [900, 540, 900]), /540w, .*900w$/);
  assert.equal(media.getPreviewMediaSrcSet('https://example.com/photo.jpg', [540, 900]), '');
});

test('explicit proxy configuration applies throughout one adapter without changing the other', () => {
  const direct = createMediaUrlHelpers();
  let enabled = true;
  const proxied = createMediaUrlHelpers({ useProxy: () => enabled });
  assert.equal(proxied.getOriginalMediaUrl(origin), `/api/media/proxy?url=${encodeURIComponent(origin)}`);
  assert.ok(proxied.getPreviewMediaFallbackUrls(origin, [{ width: 720 }]).every(url => url.startsWith('/api/media/proxy?')));
  assert.equal(proxied.resolveMediaUrl('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
  assert.equal(direct.resolveMediaUrl(origin), origin);
  enabled = false;
  assert.equal(proxied.resolveMediaUrl(origin), origin);
});

test('the Web adapter retains its existing Vite proxy setting', async () => {
  const bundle = await build({ entryPoints: ['src/utils/urlUtils.js'], bundle: true, write: false, format: 'esm',
    define: { 'import.meta.env.VITE_USE_OSS_MEDIA_PROXY': '"true"' } });
  const web = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  assert.equal(web.getOriginalMediaUrl(origin), `/api/media/proxy?url=${encodeURIComponent(origin)}`);
});
