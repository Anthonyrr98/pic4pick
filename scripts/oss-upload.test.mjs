import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the actual upload client without sending files or tokens to a server.
const bundle = await build({
  entryPoints: ['src/utils/upload.js'], bundle: true, write: false, format: 'esm',
  define: { 'import.meta.env.PROD': 'true' },
  plugins: [{ name: 'upload-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/(storage|errorHandler|urlUtils|auth|envConfig)$/ },
      (args) => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      const fixture = () => globalThis.__ossUploadFixture;
      export const STORAGE_KEYS = { ALIYUN_OSS_BACKEND_URL: 'legacy' };
      export const StorageString = {
        get: (key, fallback) => fixture().storage[key] ?? fallback,
        remove: key => { delete fixture().storage[key]; },
      };
      export const getEnvValue = (key, fallback) => fixture().env[key] ?? fallback;
      export const getAuthToken = () => 'test-admin-token';
      export const ensureHttps = value => value;
      export const safeSync = fn => fn();
      export const handleError = error => error;
      export const ErrorType = { PARSE: 'parse', NETWORK: 'network' };
    ` }));
  } }],
});
const client = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const fixture = (env = {}, storage = {}) => {
  const value = { env, storage, requests: [] };
  globalThis.__ossUploadFixture = value;
  return value;
};
test.after(() => { delete globalThis.__ossUploadFixture; });

test('the configured backend wins over a stale hidden legacy upload address', () => {
  fixture({ VITE_API_BASE_URL: 'https://current.example' }, { legacy: 'https://retired.example/api/upload/oss' });
  assert.equal(client.resolveOssBackendApiUrl(), 'https://current.example/api/upload/oss');
});

test('the explicit OSS backend wins over both the API base and the legacy address', () => {
  fixture({ VITE_API_BASE_URL: 'https://api.example', VITE_ALIYUN_OSS_BACKEND_URL: 'https://upload.example' },
    { legacy: 'https://retired.example' });
  assert.equal(client.resolveOssBackendApiUrl(), 'https://upload.example/api/upload/oss');
});

test('root, API base and full endpoint configurations resolve without duplicated paths', () => {
  for (const key of ['VITE_API_BASE_URL', 'VITE_ALIYUN_OSS_BACKEND_URL', 'legacy']) {
    for (const suffix of ['', '/', '/api', '/api/', '/api/upload/oss', '/api/upload/oss/']) {
      const value = ` https://backend.example/proxy${suffix} `;
      fixture(key === 'legacy' ? {} : { [key]: value }, key === 'legacy' ? { legacy: value } : {});
      assert.equal(client.resolveOssBackendApiUrl(), 'https://backend.example/proxy/api/upload/oss', `${key}: ${suffix}`);
    }
  }
});

test('legacy-only configurations remain supported and empty values fall through', () => {
  fixture({ VITE_ALIYUN_OSS_BACKEND_URL: ' ', VITE_API_BASE_URL: '' }, { legacy: 'https://legacy.example' });
  assert.equal(client.resolveOssBackendApiUrl(), 'https://legacy.example/api/upload/oss');
  fixture();
  assert.equal(client.resolveOssBackendApiUrl(), null);
});

const mockUploadResponse = (t, f, status, body) => {
  const original = globalThis.XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = original; });
  globalThis.XMLHttpRequest = class {
    upload = { addEventListener() {} };
    listeners = {};
    headers = {};
    addEventListener(name, listener) { this.listeners[name] = listener; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(bodyData) {
      f.requests.push({ url: this.url, method: this.method, headers: this.headers, body: bodyData });
      this.status = status;
      this.statusText = '';
      this.responseText = body;
      queueMicrotask(() => this.listeners.load());
    }
  };
};
const file = new File(['test image bytes'], 'test.jpg', { type: 'image/jpeg' });

test('plain and JSON 404 errors identify the failing URL and preserve HTTP status', async (t) => {
  for (const body of ['Not found', JSON.stringify({ error: 'Not found' })]) {
    const f = fixture({ VITE_API_BASE_URL: 'https://current.example' });
    await t.test(body, async (subtest) => {
      mockUploadResponse(subtest, f, 404, body);
      await assert.rejects(client.uploadImage(file, file.name, null, client.UPLOAD_TYPES.ALIYUN_OSS), (error) => {
        assert.match(error.message, /404/);
        assert.match(error.message, /https:\/\/current\.example\/api\/upload\/oss/);
        assert.equal(error.status, 404);
        assert.equal(error.requestUrl, 'https://current.example/api/upload/oss');
        return true;
      });
    });
  }
});

test('successful uploads keep authentication and stable submission IDs', async (t) => {
  const f = fixture({ VITE_API_BASE_URL: 'https://current.example/api/' }, { legacy: 'https://retired.example' });
  const result = { success: true, url: 'https://images.example/original.jpg', thumbnailUrl: 'https://images.example/preview.jpg', uploadId: 'stable-id' };
  mockUploadResponse(t, f, 200, JSON.stringify(result));
  const uploaded = await client.uploadImage(file, file.name, null, client.UPLOAD_TYPES.ALIYUN_OSS, { uploadId: result.uploadId });
  assert.deepEqual(uploaded, { url: result.url, thumbnailUrl: result.thumbnailUrl, uploadId: result.uploadId });
  assert.equal(f.requests[0].url, 'https://current.example/api/upload/oss');
  assert.equal(f.requests[0].headers.Authorization, 'Bearer test-admin-token');
  assert.equal(f.requests[0].body.get('uploadId'), result.uploadId);
});

test('Edge signing endpoints remain blocked before any file is sent', async () => {
  const f = fixture({ VITE_ALIYUN_OSS_BACKEND_URL: 'https://project.example/functions/v1/upload-oss' });
  await assert.rejects(client.uploadImage(file, file.name, null, client.UPLOAD_TYPES.ALIYUN_OSS), /签名直传已禁用/);
  assert.equal(f.requests.length, 0);
});
