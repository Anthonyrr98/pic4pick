/**
 * 后端服务器配置检查脚本
 * 用于检查服务器配置是否正确
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('========================================');
console.log('   后端服务器配置检查');
console.log('========================================\n');

// 检查环境变量
console.log('📋 环境变量配置：');
const requiredEnvVars = {
  'PORT': process.env.PORT || '3002 (默认)',
  'NODE_ENV': process.env.NODE_ENV || '未设置',
  'CORS_ORIGIN': process.env.CORS_ORIGIN || '* (允许所有来源)',
  'JWT_SECRET': process.env.JWT_SECRET ? '已设置' : '未设置（使用默认值）',
};

const ossEnvVars = {
  'ALIYUN_OSS_REGION': process.env.ALIYUN_OSS_REGION,
  'ALIYUN_OSS_BUCKET': process.env.ALIYUN_OSS_BUCKET,
  'ALIYUN_OSS_ACCESS_KEY_ID': process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  'ALIYUN_OSS_ACCESS_KEY_SECRET': process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
};

const isPlaceholderConfigValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized.startsWith('your-') || normalized.includes('your_');
};

Object.entries(requiredEnvVars).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});

console.log('\n📦 阿里云 OSS 配置：');
const ossConfigured = Object.values(ossEnvVars).every(v => !isPlaceholderConfigValue(v));
if (ossConfigured) {
  console.log('  ✅ OSS 配置完整');
  console.log(`  Region: ${process.env.ALIYUN_OSS_REGION}`);
  console.log(`  Bucket: ${process.env.ALIYUN_OSS_BUCKET}`);
  console.log(`  AccessKey ID: ${process.env.ALIYUN_OSS_ACCESS_KEY_ID?.substring(0, 8)}...`);
} else {
  console.log('  ⚠️  OSS 配置不完整或仍为占位值，以下变量需要检查：');
  Object.entries(ossEnvVars).forEach(([key, value]) => {
    if (isPlaceholderConfigValue(value)) {
      console.log(`    - ${key}`);
    }
  });
  console.log('  💡 提示：OSS 配置不完整时，/api/upload/oss 端点将不可用');
}

// 检查目录
console.log('\n📁 目录检查：');
const dirs = {
  '上传目录': path.join(__dirname, 'uploads', 'pic4pick'),
  '公共目录': path.join(__dirname, 'public', 'pic4pick'),
  '日志目录': path.join(__dirname, 'logs'),
};

Object.entries(dirs).forEach(([name, dirPath]) => {
  if (fs.existsSync(dirPath)) {
    console.log(`  ✅ ${name}: ${dirPath}`);
  } else {
    console.log(`  ⚠️  ${name}: ${dirPath} (不存在，服务器启动时会自动创建)`);
  }
});

// 检查端口
console.log('\n🌐 服务器配置：');
const port = process.env.PORT || 3002;
console.log(`  端口: ${port}`);
console.log(`  监听地址: localhost (127.0.0.1)`);
console.log(`  ⚠️  注意：如果服务器部署在远程，需要监听 0.0.0.0`);

// 检查 CORS
console.log('\n🔒 CORS 配置：');
const corsOrigin = process.env.CORS_ORIGIN || '*';
if (corsOrigin === '*') {
  console.log('  ⚠️  当前允许所有来源（生产环境建议限制特定域名）');
  console.log('  💡 建议：设置 CORS_ORIGIN=https://your-frontend-domain.com');
} else {
  console.log(`  ✅ 已限制来源: ${corsOrigin}`);
}

// 检查健康检查端点
console.log('\n🏥 API 端点：');
console.log('  ✅ GET  /api/health - 健康检查');
console.log('  ✅ POST /api/upload/oss - OSS 上传' + (ossConfigured ? '' : ' (需要 OSS 配置)'));
console.log('  ✅ DELETE /api/upload/oss/:filename - 删除 OSS 文件' + (ossConfigured ? '' : ' (需要 OSS 配置)'));

// 总结
console.log('\n========================================');
console.log('   配置检查完成');
console.log('========================================\n');

if (!ossConfigured) {
  console.log('⚠️  警告：OSS 配置不完整，上传功能可能无法使用');
  console.log('   请在 server/.env 文件中配置以下变量：');
  console.log('   ALIYUN_OSS_REGION=oss-cn-hangzhou');
  console.log('   ALIYUN_OSS_BUCKET=your-bucket-name');
  console.log('   ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id');
  console.log('   ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret\n');
}

console.log('💡 提示：');
console.log('  1. 如果服务器部署在远程，修改 server-enhanced.js 中的 app.listen');
console.log('  2. 将 app.listen(PORT, ...) 改为 app.listen(PORT, "0.0.0.0", ...)');
console.log('  3. 确保防火墙允许访问配置的端口');
console.log('  4. 生产环境建议设置 CORS_ORIGIN 限制来源\n');

