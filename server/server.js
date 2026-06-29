import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import OSS from 'ali-oss';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

const parsePositiveIntegerEnv = (key, fallback) => {
  const value = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const UPLOAD_REQUEST_TIMEOUT_MS = parsePositiveIntegerEnv('UPLOAD_REQUEST_TIMEOUT_MS', 10 * 60 * 1000);
const ALIYUN_OSS_TIMEOUT_MS = parsePositiveIntegerEnv('ALIYUN_OSS_TIMEOUT_MS', 5 * 60 * 1000);

// 设置服务器级别的超时，适合大文件上传
app.timeout = UPLOAD_REQUEST_TIMEOUT_MS;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'pic4pick');
const PUBLIC_DIR = path.join(__dirname, 'public', 'pic4pick');

// 确保上传目录存在
[UPLOAD_DIR, PUBLIC_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 使用原始文件名或生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件（JPG、PNG、GIF、WebP）'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: fileFilter
});

// 提供静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常' });
});

// 上传图片接口
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const file = req.file;
    const filename = req.body.filename || file.filename;
    
    // 可选：使用 sharp 压缩和优化图片
    let processedFilename = filename;
    if (req.body.optimize === 'true') {
      const optimizedPath = path.join(PUBLIC_DIR, `optimized-${filename}`);
      await sharp(file.path)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(optimizedPath);
      processedFilename = `optimized-${filename}`;
    }

    // 构建文件访问 URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/pic4pick/${processedFilename}`;
    
    res.json({
      success: true,
      url: fileUrl,
      filename: processedFilename,
      originalName: file.originalname,
      size: file.size,
      message: '上传成功'
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: error.message || '上传失败' });
  }
});

// 删除图片接口
app.delete('/api/upload/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    const optimizedPath = path.join(PUBLIC_DIR, filename);
    
    // 删除原文件和优化后的文件
    [filePath, optimizedPath].forEach(p => {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });
    
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除错误:', error);
    res.status(500).json({ error: error.message || '删除失败' });
  }
});

// 获取所有图片列表
app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => {
        const filePath = path.join(UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          url: `${req.protocol}://${req.get('host')}/uploads/pic4pick/${file}`,
          size: stats.size,
          createdAt: stats.birthtime
        };
      });
    
    res.json({ success: true, images });
  } catch (error) {
    console.error('获取图片列表错误:', error);
    res.status(500).json({ error: error.message || '获取失败' });
  }
});

const isPlaceholderConfigValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized.startsWith('your-') || normalized.includes('your_');
};

const ossConfig = {
  region: process.env.ALIYUN_OSS_REGION,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
};

const ossConfigReady = Object.values(ossConfig).every((value) => !isPlaceholderConfigValue(value));

// 初始化阿里云 OSS 客户端（如果配置了）
let ossClient = null;
if (ossConfigReady) {
  ossClient = new OSS({
    region: ossConfig.region,
    accessKeyId: ossConfig.accessKeyId,
    accessKeySecret: ossConfig.accessKeySecret,
    bucket: ossConfig.bucket,
    timeout: ALIYUN_OSS_TIMEOUT_MS,
  });
  console.log(`✅ 阿里云 OSS 客户端已初始化 (Timeout: ${ALIYUN_OSS_TIMEOUT_MS}ms)`);
} else {
  const invalidKeys = Object.entries(ossConfig)
    .filter(([, value]) => isPlaceholderConfigValue(value))
    .map(([key]) => key)
    .join(', ');
  console.warn(`阿里云 OSS 客户端未初始化，配置缺失或仍为占位值: ${invalidKeys}`);
}

const OSS_OBJECT_KEY_PREFIX_RE = /^(origin|ore|pic4pick)\//;

const getBeijingDatePrefix = (date = new Date()) => {
  const beijingOffsetMs = 8 * 60 * 60 * 1000;
  const [year, month, day] = new Date(date.getTime() + beijingOffsetMs)
    .toISOString()
    .slice(0, 10)
    .split('-');
  return `${year}/${month}/${day}`;
};

function parseAllowedOssObjectKey(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!parsed.hostname.endsWith('.aliyuncs.com')) return null;
  const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!key || !OSS_OBJECT_KEY_PREFIX_RE.test(key)) return null;
  return key;
}

app.get('/api/media/proxy', async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(503).json({ error: 'OSS 客户端未配置' });
    }
    const objectKey = parseAllowedOssObjectKey(req.query.url);
    if (!objectKey) {
      return res.status(400).json({ error: '无效或不允许的 OSS URL' });
    }
    const result = await ossClient.getStream(objectKey, { timeout: ALIYUN_OSS_TIMEOUT_MS });
    const contentType = result.res?.headers?.['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    result.stream.pipe(res);
  } catch (error) {
    console.error('OSS 代理读取失败:', error.message);
    res.status(404).json({ error: '文件不存在或无法读取' });
  }
});

// 上传到阿里云 OSS（后端代理）
app.post('/api/upload/oss', upload.single('file'), async (req, res) => {
  req.setTimeout(UPLOAD_REQUEST_TIMEOUT_MS);

  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置，请检查环境变量' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const file = req.file;
    const filename = req.body.filename || file.filename;
    const objectKey = `pic4pick/${getBeijingDatePrefix()}/${filename}`;

    // 可选：使用 sharp 优化图片
    let fileBuffer = fs.readFileSync(file.path);
    if (req.body.optimize === 'true') {
      fileBuffer = await sharp(file.path)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    // 上传到 OSS
    const result = await ossClient.put(objectKey, fileBuffer, {
      timeout: ALIYUN_OSS_TIMEOUT_MS,
      headers: {
        'Content-Type': file.mimetype,
        'x-oss-object-acl': 'public-read', // 设置为公共读
      },
    });

    // 删除本地临时文件
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      url: result.url,
      filename: filename,
      originalName: file.originalname,
      size: file.size,
      message: '上传到 OSS 成功'
    });
  } catch (error) {
    console.error('OSS 上传错误:', error);
    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message || 'OSS 上传失败' });
  }
});

// 从 OSS 删除文件
app.delete('/api/upload/oss/:filename(*)', async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置' });
    }

    // filename 可能包含路径，例如 "origin/filename.jpg" 或 "ore/filename.jpg"
    const filename = req.params.filename;
    console.log('收到删除请求，filename:', filename);
    
    // 构建 objectKey
    let objectKeys = [];
    
    if (filename.includes('/')) {
      // 已经包含路径，直接使用
      objectKeys.push(filename);
    } else {
      // 只有文件名，尝试 origin/ 和 ore/ 两个路径
      objectKeys.push(`origin/${filename}`);
      objectKeys.push(`ore/${filename}`);
      // 也尝试旧的 pic4pick/ 路径（向后兼容）
      objectKeys.push(`pic4pick/${filename}`);
    }
    
    // 尝试删除所有可能的路径
    const deleteResults = [];
    for (const objectKey of objectKeys) {
      try {
        await ossClient.delete(objectKey, { timeout: ALIYUN_OSS_TIMEOUT_MS });
        deleteResults.push({ objectKey, success: true });
        console.log('成功删除OSS文件:', objectKey);
      } catch (deleteError) {
        // 如果文件不存在，忽略错误（可能已经删除或路径不对）
        if (deleteError.code === 'NoSuchKey' || deleteError.status === 404) {
          deleteResults.push({ objectKey, success: false, reason: '文件不存在' });
          console.log('文件不存在，跳过:', objectKey);
        } else {
          deleteResults.push({ objectKey, success: false, error: deleteError.message });
          console.error('删除OSS文件失败:', objectKey, deleteError);
        }
      }
    }
    
    // 如果至少有一个删除成功，返回成功
    const hasSuccess = deleteResults.some(r => r.success);
    if (hasSuccess) {
      res.json({ 
        success: true, 
        message: '从 OSS 删除成功',
        deleted: deleteResults.filter(r => r.success).map(r => r.objectKey)
      });
    } else {
      // 所有删除都失败，但如果是文件不存在，也算成功（可能已经删除过了）
      const allNotFound = deleteResults.every(r => r.reason === '文件不存在');
      if (allNotFound) {
        res.json({ 
          success: true, 
          message: '文件不存在（可能已删除）',
          deleted: []
        });
      } else {
        res.status(500).json({ 
          error: '删除失败', 
          details: deleteResults 
        });
      }
    }
  } catch (error) {
    console.error('OSS 删除错误:', error);
    res.status(500).json({ error: error.message || '删除失败' });
  }
});

// 错误处理中间件
app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制（最大 10MB）' });
    }
  }
  res.status(500).json({ error: error.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📁 上传目录: ${UPLOAD_DIR}`);
  console.log(`🌐 静态文件: http://localhost:${PORT}/uploads/pic4pick/`);
});
