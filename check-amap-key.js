// 检查高德地图 API key 配置
import { readFileSync } from 'fs';

console.log('=== 高德地图 API Key 配置检查 ===\n');

// 1. 检查 .env 文件
try {
  const envContent = readFileSync('.env', 'utf-8');
  const amapKeyMatch = envContent.match(/VITE_AMAP_KEY=(.+)/);
  
  if (amapKeyMatch) {
    const key = amapKeyMatch[1].trim();
    console.log('✅ .env 文件存在');
    console.log(`✅ API Key 已配置: ${key.substring(0, 10)}...${key.substring(key.length - 4)}`);
    console.log(`   完整 Key: ${key}`);
    
    // 验证 key 格式（高德地图 key 通常是 32 位字符串）
    if (key.length === 32) {
      console.log('✅ Key 格式正确（32位）');
    } else {
      console.log(`⚠️  Key 长度异常: ${key.length} 位（通常为 32 位）`);
    }
  } else {
    console.log('❌ .env 文件中未找到 VITE_AMAP_KEY');
  }
} catch (error) {
  console.log('❌ 无法读取 .env 文件:', error.message);
}

console.log('\n=== 代码配置检查 ===\n');

// 2. 检查代码中的使用
try {
  const adminJs = readFileSync('src/pages/Admin.jsx', 'utf-8');
  
  if (adminJs.includes('import.meta.env.VITE_AMAP_KEY')) {
    console.log('✅ Admin.jsx 中正确读取环境变量');
  } else {
    console.log('❌ Admin.jsx 中未找到环境变量读取代码');
  }
  
  if (adminJs.includes('/amap-api/')) {
    console.log('✅ 代码中使用代理路径 /amap-api/');
  } else {
    console.log('❌ 代码中未找到代理路径');
  }
} catch (error) {
  console.log('❌ 无法读取 Admin.jsx:', error.message);
}

// 3. 检查 vite.config.js
try {
  const viteConfig = readFileSync('vite.config.js', 'utf-8');
  
  if (viteConfig.includes('/amap-api')) {
    console.log('✅ vite.config.js 中配置了代理');
  } else {
    console.log('❌ vite.config.js 中未找到代理配置');
  }
} catch (error) {
  console.log('❌ 无法读取 vite.config.js:', error.message);
}

console.log('\n=== 重要提示 ===');
console.log('⚠️  如果修改了 .env 文件，需要重启开发服务器才能生效！');
console.log('⚠️  运行命令: npm run dev');

