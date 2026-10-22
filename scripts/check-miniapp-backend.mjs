// No administrator credentials or valid like deltas are sent. Both guards run before DB writes.
const expected = process.argv.find(value => value.startsWith('--expect='))?.slice(9) || 'compat';
const base = (process.argv.find(value => value.startsWith('--base='))?.slice(7) || 'https://pic4pick-backend.onrender.com').replace(/\/+$/, '');
if (!['legacy', 'compat'].includes(expected) || !/^https:\/\//.test(base)) throw new Error('Use --expect=legacy|compat and an HTTPS --base');
const id = '__miniapp_contract_probe__';
const checks = [
  ['health', 'GET', '/api/health', 200],
  ['original admin auth', 'PATCH', `/api/admin/photos/${id}`, 401],
  ['miniapp admin auth', 'POST', `/api/admin/photos/${id}/update`, expected === 'compat' ? 401 : 404],
  ['original likes reject invalid delta', 'PATCH', `/api/photos/${id}/likes`, 400, { delta: 2 }],
  ['miniapp likes reject invalid delta', 'POST', `/api/photos/${id}/likes`, expected === 'compat' ? 400 : 404, { delta: 2 }],
];
let failed = false;
for (const [name, method, path, status, body] of checks) {
  try {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    await response.arrayBuffer();
    const passed = response.status === status;
    failed ||= !passed;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}, expected ${status}`);
  } catch (error) { failed = true; console.log(`FAIL ${name}: ${error.name}`); }
}
process.exitCode = failed ? 1 : 0;
