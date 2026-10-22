import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const unitFiles = ['server', 'scripts'].flatMap(directory => readdirSync(new URL(`../${directory}/`, import.meta.url))
  .filter(name => /\.test\.(?:js|mjs)$/.test(name)).map(name => `${directory}/${name}`));
const miniTests = readdirSync(new URL('../miniapp/tests/', import.meta.url))
  .filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`);
const checks = [
  ['Web/shared/server/scripts lint', '.', ['node_modules/eslint/bin/eslint.js', '.']],
  ['Web typecheck', '.', ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']],
  ['Web/server unit tests', '.', ['--test', '--test-reporter=dot', ...unitFiles]],
  ['Miniapp lint', 'miniapp', ['node_modules/eslint/bin/eslint.js', 'src', 'config', 'tests']],
  ['Miniapp/shared typecheck', 'miniapp', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['Miniapp unit tests', 'miniapp', ['node_modules/tsx/dist/cli.mjs', '--test', '--test-reporter=dot', ...miniTests]],
];

for (const [label, directory, args] of checks) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { cwd: new URL(`${directory}/`, new URL('../', import.meta.url)), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\nWeb production build (in memory)');
process.chdir(root);
const { build } = await import('vite');
const { default: configure } = await import('../vite.config.js');
const config = configure({ command: 'build', mode: 'production' });
await build({ ...config, configFile: false, logLevel: 'error',
  build: { ...config.build, write: false, emptyOutDir: false } });
console.log('All project checks passed.');
