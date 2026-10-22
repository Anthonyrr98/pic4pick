import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('all Web API consumers preserve relative, root, api-suffixed and whitespace configurations', async () => {
  for (const base of ['', ' https://api.example/ ', 'https://api.example/api///']) {
    const bundle = await build({ entryPoints: ['src/utils/apiUrl.js'], bundle: true, write: false, format: 'esm',
      plugins: [{ name: 'api-base-fixture', setup(builder) {
        builder.onResolve({ filter: /^\.\/envConfig$/ }, () => ({ path: 'config', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getEnvValue = () => ${JSON.stringify(base)};` }));
      } }] });
    const { getApiUrl } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const path = '/api/photos/id/likes';
    assert.equal(getApiUrl(path), base ? `https://api.example${path}` : path);
  }
});
