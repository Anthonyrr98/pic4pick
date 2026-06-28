import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const placeholderPattern = /(change|replace|placeholder|example|your-|your_)/i;

const isPlaceholder = (value) => {
  const normalized = String(value || '').trim();
  return !normalized || placeholderPattern.test(normalized);
};

const mask = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'missing';
  return `set (${normalized.length} chars)`;
};

const checks = [];

const addCheck = (name, ok, detail) => {
  checks.push({ name, ok, detail });
};

addCheck('PORT', Boolean(process.env.PORT || '3002'), process.env.PORT || '3002 (default)');
addCheck('NODE_ENV', Boolean(process.env.NODE_ENV), process.env.NODE_ENV || 'not set');
addCheck('CORS_ORIGIN', Boolean(process.env.CORS_ORIGIN), process.env.CORS_ORIGIN || '* (default)');

addCheck(
  'JWT_SECRET',
  !isPlaceholder(process.env.JWT_SECRET) && String(process.env.JWT_SECRET || '').length >= 32,
  mask(process.env.JWT_SECRET),
);
addCheck(
  'ADMIN_USERNAME',
  !isPlaceholder(process.env.ADMIN_USERNAME) && String(process.env.ADMIN_USERNAME || '').trim().toLowerCase() !== 'admin',
  mask(process.env.ADMIN_USERNAME),
);
addCheck(
  'ADMIN_PASSWORD',
  !isPlaceholder(process.env.ADMIN_PASSWORD) && String(process.env.ADMIN_PASSWORD || '').length >= 12,
  mask(process.env.ADMIN_PASSWORD),
);

addCheck(
  'SUPABASE_URL',
  !isPlaceholder(process.env.SUPABASE_URL) && /^https:\/\/.+\.supabase\.co$/i.test(String(process.env.SUPABASE_URL || '').trim()),
  mask(process.env.SUPABASE_URL),
);
addCheck(
  'SUPABASE_SERVICE_ROLE_KEY',
  !isPlaceholder(process.env.SUPABASE_SERVICE_ROLE_KEY),
  mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
);

const ossKeys = [
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ACCESS_KEY_ID',
  'ALIYUN_OSS_ACCESS_KEY_SECRET',
];

for (const key of ossKeys) {
  addCheck(key, !isPlaceholder(process.env[key]), mask(process.env[key]));
}

const directories = [
  path.join(__dirname, 'uploads', 'pic4pick'),
  path.join(__dirname, 'public', 'pic4pick'),
  path.join(__dirname, 'logs'),
];

console.log('Pic4Pick server config check');
console.log('============================');

for (const check of checks) {
  console.log(`${check.ok ? 'OK   ' : 'MISS '} ${check.name}: ${check.detail}`);
}

console.log('\nDirectories');
for (const dir of directories) {
  console.log(`${fs.existsSync(dir) ? 'OK   ' : 'INFO '} ${dir}${fs.existsSync(dir) ? '' : ' (created on server start)'}`);
}

const failed = checks.filter((check) => !check.ok);

console.log('\nEndpoints');
console.log('OK    GET    /api/health');
console.log('OK    POST   /api/auth/login');
console.log('OK    POST   /api/upload/oss (requires auth + OSS config)');
console.log(`${failed.some((check) => check.name.startsWith('SUPABASE_')) ? 'MISS ' : 'OK   '} /api/admin/* (requires auth + Supabase admin config)`);

if (failed.length) {
  console.log('\nAction needed');
  for (const check of failed) {
    console.log(`- Configure ${check.name} in server/.env`);
  }
  process.exitCode = 1;
} else {
  console.log('\nAll required server config values are present.');
}
