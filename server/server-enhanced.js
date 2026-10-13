import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import OSS from 'ali-oss';
import dotenv from 'dotenv';
import winston from 'winston';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createPhotoDeletionService } from './photoDeletion.js';
import { createPhotoUploadService } from './photoUploads.js';
import { createLikeNotificationService } from './likeNotifications.js';
import { createPhotoLikeHandler, createLikeEventsHandler } from './photoLikes.js';
import { createSpatialDepthHandler, createSpatialOssClient } from './spatialDepthStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3002;
const DEFAULT_JWT_SECRET = 'your-secret-key-change-this-in-production';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

const parsePositiveIntegerEnv = (key, fallback) => {
  const value = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const UPLOAD_REQUEST_TIMEOUT_MS = parsePositiveIntegerEnv('UPLOAD_REQUEST_TIMEOUT_MS', 10 * 60 * 1000);
const ALIYUN_OSS_TIMEOUT_MS = parsePositiveIntegerEnv('ALIYUN_OSS_TIMEOUT_MS', 5 * 60 * 1000);

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || JWT_SECRET === DEFAULT_JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('生产环境必须配置长度至少 32 位的 JWT_SECRET，不能使用默认值');
  }
  if (!process.env.ADMIN_USERNAME || ADMIN_USERNAME === DEFAULT_ADMIN_USERNAME) {
    throw new Error('生产环境必须配置非默认 ADMIN_USERNAME');
  }
  if (!process.env.ADMIN_PASSWORD || ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('生产环境必须配置长度至少 12 位的非默认 ADMIN_PASSWORD');
  }
  if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*') {
    throw new Error('生产环境必须配置明确的 CORS_ORIGIN，不能使用通配符');
  }
}

// 设置服务器级别的超时（10分钟，适合大文件上传）
app.timeout = UPLOAD_REQUEST_TIMEOUT_MS;

// 配置 Winston 日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// 中间件
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const configuredCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const corsOptions = {
  origin: configuredCorsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24小时
  optionsSuccessStatus: 200 // 兼容旧版浏览器
};

app.use(cors(corsOptions));

// 处理预检请求
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const createMemoryRateLimiter = ({ windowMs, max, key = (req) => req.ip }) => {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = key(req);
    const current = buckets.get(bucketKey);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    if (buckets.size > 5000) {
      for (const [entryKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(entryKey);
      }
    }
    next();
  };
};

const loginRateLimit = createMemoryRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const likeRateLimit = createMemoryRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  key: (req) => `${req.ip}:${req.params.id || 'unknown'}`,
});

// 配置上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'pic4pick');
const PUBLIC_DIR = path.join(__dirname, 'public', 'pic4pick');
const LOG_DIR = path.join(__dirname, 'logs');

// 确保目录存在
[UPLOAD_DIR, PUBLIC_DIR, LOG_DIR].forEach(dir => {
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// 增强的文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|heic/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    logger.info(`File upload: ${file.originalname}, type: ${file.mimetype}`);
    return cb(null, true);
  } else {
    logger.warn(`Rejected file upload: ${file.originalname}, invalid type: ${file.mimetype}`);
    cb(new Error('只允许上传图片文件（JPG、PNG、GIF、WebP、HEIC）'));
  }
};

// 原图可超过 OSS 20MB 图片处理上限；高清预览由本服务使用 Sharp 生成。
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    fieldSize: 10 * 1024 * 1024, // 10MB for other fields
  },
});

// 提供静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// JWT 认证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '访问被拒绝，需要token' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn(`Token verification failed: ${err.message}`);
      return res.status(403).json({ error: 'Token无效' });
    }
    req.user = user;
    next();
  });
};

// 管理员权限中间件
const requireAdmin = (req, res, next) => {
  if (!req.user?.username || req.user.username !== ADMIN_USERNAME) {
    logger.warn(`Admin access denied for user: ${req.user?.username || 'unknown'}`);
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

// === API 端点 ===

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常', revision: process.env.RENDER_GIT_COMMIT || null });
});

// 上传本地图片
app.post('/api/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const file = req.file;
    const requestedFilename = String(req.body.filename || file.filename);
    const filename = path.basename(requestedFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!filename) {
      return res.status(400).json({ error: '文件名无效' });
    }
    let processedFilename = filename;
    if (req.body.optimize === 'true') {
      const optimizedPath = path.join(PUBLIC_DIR, `optimized-${filename}`);
      await sharp(file.path)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(optimizedPath);
      processedFilename = `optimized-${filename}`;
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/pic4pick/${processedFilename}`;

    logger.info(`Local upload successful: ${filename}`);

    res.json({
      success: true,
      url: fileUrl,
      filename: processedFilename,
      originalName: file.originalname,
      size: file.size,
      message: '上传成功'
    });
  } catch (error) {
    logger.error(`Upload error: ${error.message}`);
    res.status(500).json({ error: error.message || '上传失败' });
  }
});

// 删除图片
app.delete('/api/upload/:filename', authenticateToken, requireAdmin, (req, res) => {
  try {
    const filename = path.basename(String(req.params.filename || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!filename || filename === '.' || filename === '..') {
      return res.status(400).json({ error: '文件名无效' });
    }
    const filePath = path.join(UPLOAD_DIR, filename);
    const optimizedPath = path.join(PUBLIC_DIR, filename);

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
app.get('/api/images', authenticateToken, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(file))
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

// 初始化阿里云 OSS 客户端
let ossClient = null;
if (ossConfigReady) {
  // 自动处理 Region 格式：如果用户输入的是 cn-beijing，自动转换为 oss-cn-beijing
  let region = ossConfig.region.trim();
  if (!region.startsWith('oss-')) {
    region = `oss-${region}`;
  }
  
  ossClient = new OSS({
    region: region,
    accessKeyId: ossConfig.accessKeyId,
    accessKeySecret: ossConfig.accessKeySecret,
    bucket: ossConfig.bucket,
    timeout: ALIYUN_OSS_TIMEOUT_MS,
  });
  logger.info(`✅ 阿里云 OSS 客户端已初始化 (Region: ${region}, Bucket: ${ossConfig.bucket}, Timeout: ${ALIYUN_OSS_TIMEOUT_MS}ms)`);
} else {
  const invalidKeys = Object.entries(ossConfig)
    .filter(([, value]) => isPlaceholderConfigValue(value))
    .map(([key]) => key)
    .join(', ');
  logger.warn(`阿里云 OSS 客户端未初始化，配置缺失或仍为占位值: ${invalidKeys}`);
}

const OSS_OBJECT_KEY_PREFIX_RE = /^(origin|ore|pic4pick)\//;

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PHOTO_SELECT_FIELDS = [
  'id',
  'title',
  'location',
  'country',
  'category',
  'tags',
  'image_url',
  'thumbnail_url',
  'latitude',
  'longitude',
  'altitude',
  'focal',
  'aperture',
  'shutter',
  'iso',
  'camera',
  'lens',
  'film_stock',
  'rating',
  'shot_date',
  'created_at',
  'status',
  'hidden',
  'reject_reason',
  'likes',
].join(',');

const isSupabaseAdminConfigured = () => Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const supabaseAdminFetch = async (table, params = new URLSearchParams(), options = {}) => {
  if (!isSupabaseAdminConfigured()) {
    const error = new Error('Supabase 管理端未配置：请在 server/.env 配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
    error.status = 503;
    throw error;
  }

  const query = params.toString();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawBody = await response.text();
  let data = null;
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = rawBody;
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.details || response.statusText;
    const error = new Error(message || `Supabase REST 请求失败: ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
};

const sendSupabaseAdminError = (res, error, fallbackMessage) => {
  logger.error(fallbackMessage, { message: error.message, details: error.details });
  res.status(error.status || 500).json({
    error: error.message || fallbackMessage,
    details: process.env.NODE_ENV === 'development' ? error.details : undefined,
  });
};

const photoDeletion = createPhotoDeletionService({
  db: supabaseAdminFetch,
  bucket: ossConfig.bucket,
  logger,
  deleteObject: async (key) => {
    if (!ossClient) throw new Error('OSS 客户端未配置');
    await ossClient.delete(key, { timeout: Math.min(ALIYUN_OSS_TIMEOUT_MS, 15000) });
  },
});

const photoUploads = createPhotoUploadService({
  db: supabaseAdminFetch,
  bucket: ossConfig.bucket,
  logger,
  deleteObject: async (key) => {
    if (!ossClient) throw new Error('OSS 客户端未配置');
    await ossClient.delete(key, { timeout: Math.min(ALIYUN_OSS_TIMEOUT_MS, 15000) });
  },
});

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

// 代理读取 OSS 对象（供前端在无法直连 OSS 时使用）
let spatialOssClient;
app.get('/api/photos/:id/spatial-depth', createMemoryRateLimiter({ windowMs: 60_000, max: 120 }), createSpatialDepthHandler({
  db: supabaseAdminFetch,
  getClient: () => (spatialOssClient ||= createSpatialOssClient()),
  logger,
}));

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
    logger.warn(`OSS 代理读取失败: ${error.message}`);
    res.status(404).json({ error: '文件不存在或无法读取' });
  }
});

const likeNotifications = createLikeNotificationService({ db: supabaseAdminFetch, logger });
app.get('/api/admin/like-events', authenticateToken, requireAdmin, createLikeEventsHandler({
  db: supabaseAdminFetch,
  sendError: sendSupabaseAdminError,
}));
const mailTestRateLimit = createMemoryRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
app.post('/api/admin/notifications/likes/test', authenticateToken, requireAdmin, mailTestRateLimit, async (_req, res) => {
  try {
    await likeNotifications.sendTest();
    res.json({ success: true, message: '测试邮件已提交给邮件服务器' });
  } catch (error) {
    sendSupabaseAdminError(res, error, '测试邮件发送失败');
  }
});
app.patch('/api/photos/:id/likes', likeRateLimit, createPhotoLikeHandler({
  db: supabaseAdminFetch,
  notifications: likeNotifications,
  logger,
  sendError: sendSupabaseAdminError,
}));

// 上传到阿里云 OSS
app.post('/api/upload/oss', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  // 设置较长的超时时间，避免大文件或慢速 OSS 响应被过早中断
  req.setTimeout(UPLOAD_REQUEST_TIMEOUT_MS);
  const writtenKeys = [];
  let trackedUpload = false;
  
  try {
    if (!ossClient) {
      logger.error('OSS 客户端未配置');
      return res.status(500).json({ error: 'OSS 客户端未配置' });
    }

    if (!req.file) {
      logger.warn('上传请求中没有文件');
      return res.status(400).json({ error: '没有上传文件' });
    }
    
    logger.info(`开始处理 OSS 上传: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    const file = req.file;
    const uploadId = req.body.uploadId;
    if (uploadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
      throw Object.assign(new Error('上传 ID 无效'), { status: 400 });
    }
    const requestedFilename = String(req.body.filename || file.filename);
    const filename = path.basename(requestedFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!filename) {
      return res.status(400).json({ error: '文件名无效' });
    }
    // 原图放在 origin，统一的灯箱高清预览放在 ore/hd。
    const datePrefix = getBeijingDatePrefix();
    const originKey = `origin/${datePrefix}/${filename}`;
    const previewFilename = `${path.parse(filename).name}.jpg`;
    const thumbKey = `ore/hd/${datePrefix}/${previewFilename}`;

    // 保留真正原文件；显示方向与压缩只应用到高清预览。
    const originalBuffer = fs.readFileSync(file.path);

    // 生成最长边 2000px 的灯箱高清预览，网格再由 OSS 按需缩小。
    let thumbBuffer;
    try {
      const thumbImage = sharp(file.path);
      // 读取元数据确保能获取 EXIF
      await thumbImage.metadata();
      
      thumbBuffer = await thumbImage
        .rotate() // 根据 EXIF Orientation 自动旋转
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } catch (thumbError) {
      logger.warn('生成缩略图失败，仅上传原图:', thumbError.message || thumbError);
      thumbBuffer = null;
    }

    // 上传原始字节；超过 20MB 也不依赖 OSS 图片处理能力。
    const putOrigin = (key) => ossClient.put(key, originalBuffer, {
      timeout: ALIYUN_OSS_TIMEOUT_MS,
      headers: {
        'Content-Type': file.mimetype || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.originalname)}"`,
        'x-oss-object-acl': 'public-read',
      },
    });

    // 如果缩略图生成成功，则上传到 ore 目录
    const putThumb = (key) => ossClient.put(key, thumbBuffer, {
        timeout: ALIYUN_OSS_TIMEOUT_MS,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'x-oss-object-acl': 'public-read',
        },
      });
    const objectUrl = (key) => ossClient.generateObjectUrl(key).replace(/^http:\/\//, 'https://');
    const result = { url: objectUrl(originKey), thumbnailUrl: thumbBuffer ? objectUrl(thumbKey) : null };
    let uploaded;
    if (uploadId) {
      trackedUpload = true;
      const assets = [originKey, ...(thumbBuffer ? [thumbKey] : [])].map((key) => ({ key, url: objectUrl(key) }));
      uploaded = await photoUploads.upload({
        id: uploadId, fingerprint: crypto.createHash('sha256').update(originalBuffer).digest('hex'), assets, result,
        writeObjects: async (savedAssets) => {
          await putOrigin(savedAssets[0].key);
          if (savedAssets[1]) {
            if (!thumbBuffer) throw new Error('无法生成高清预览，请重试');
            await putThumb(savedAssets[1].key);
          }
        },
      });
    } else {
      // Compatibility for older/local clients without a tracked submission.
      writtenKeys.push(originKey);
      await putOrigin(originKey);
      if (thumbBuffer) {
        writtenKeys.push(thumbKey);
        await putThumb(thumbKey);
      }
      uploaded = result;
    }

    logger.info(`OSS 上传成功: ${filename}, 原图: ${uploaded.url}, 缩略图: ${uploaded.thumbnailUrl || '无'}`);

    res.json({
      success: true,
      ...uploaded,
      filename: filename,
      originalName: file.originalname,
      size: file.size,
      message: '上传到 OSS 成功'
    });
  } catch (error) {
    logger.error('OSS 上传错误:', error);
    if (!trackedUpload) {
      const cleanupResults = await Promise.allSettled(writtenKeys.map((key) => ossClient.delete(key)));
      if (cleanupResults.some((result) => result.status === 'rejected')) logger.warn('旧版上传失败后的 OSS 清理未完成');
    }
    
    // 返回详细的错误信息
    const errorMessage = error.message || 'OSS 上传失败';
    logger.error(`OSS 上传失败: ${errorMessage}`);
    res.status(error.status || 500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (error) {
        logger.warn('清理上传临时文件失败:', error.message);
      }
    }
  }
});

// 从 OSS 删除文件
app.delete('/api/upload/oss/*filename', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置' });
    }

    // filename 可能包含路径，例如 "origin/filename.jpg" 或 "ore/filename.jpg"
    const rawFilename = Array.isArray(req.params.filename)
      ? req.params.filename.join('/')
      : req.params.filename;
    const filename = String(rawFilename || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!filename || filename.split('/').includes('..') || (filename.includes('/') && !OSS_OBJECT_KEY_PREFIX_RE.test(filename))) {
      return res.status(400).json({ error: 'OSS 对象路径无效' });
    }
    logger.info('收到删除请求，filename:', filename);
    
    // 构建 objectKey
    // 如果 filename 已经包含 origin/ 或 ore/，直接使用
    // 否则尝试两种路径：origin/ 和 ore/
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
        logger.info('成功删除OSS文件:', objectKey);
      } catch (deleteError) {
        // 如果文件不存在，忽略错误（可能已经删除或路径不对）
        if (deleteError.code === 'NoSuchKey' || deleteError.status === 404) {
          deleteResults.push({ objectKey, success: false, reason: '文件不存在' });
          logger.info('文件不存在，跳过:', objectKey);
        } else {
          deleteResults.push({ objectKey, success: false, error: deleteError.message });
          logger.error('删除OSS文件失败:', objectKey, deleteError);
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
    logger.error('OSS 删除错误:', error);
    res.status(500).json({ 
      error: error.message || '删除失败',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// === 认证 API ===

// 用户登录
app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const safeEqual = (left, right) => {
      const leftHash = crypto.createHash('sha256').update(String(left)).digest();
      const rightHash = crypto.createHash('sha256').update(String(right)).digest();
      return crypto.timingSafeEqual(leftHash, rightHash);
    };
    const isValidUsername = safeEqual(username, ADMIN_USERNAME);
    const isValidPassword = safeEqual(password, ADMIN_PASSWORD);

    if (!isValidUsername || !isValidPassword) {
      logger.warn(`Login failed for username: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });

    logger.info(`User logged in: ${username}`);

    res.json({
      success: true,
      token,
      expiresIn: '24h',
      username
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ error: '登录失败' });
  }
});

// 验证 token
app.post('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// 刷新 token
app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const newToken = jwt.sign({ username: req.user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    success: true,
    token: newToken,
    expiresIn: '24h'
  });
});

// === 管理端 Supabase API（所有写操作必须经过 JWT 管理员校验） ===

app.get('/api/admin/photos', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const params = new URLSearchParams({
      select: PHOTO_SELECT_FIELDS,
      order: 'created_at.desc',
      limit: String(Math.min(Number(req.query.limit) || 1000, 1000)),
    });
    const data = await supabaseAdminFetch('photos', params);
    res.json({ success: true, data: data || [] });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端照片列表读取失败');
  }
});

app.get('/api/admin/photos/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requestedFields = typeof req.query.select === 'string'
      ? req.query.select.split(',').map((field) => field.trim()).filter(Boolean)
      : [];
    const allowedFields = new Set(PHOTO_SELECT_FIELDS.split(','));
    const select = requestedFields.length && requestedFields.every((field) => allowedFields.has(field))
      ? requestedFields.join(',')
      : PHOTO_SELECT_FIELDS;
    const params = new URLSearchParams({
      select,
      id: `eq.${req.params.id}`,
      limit: '1',
    });
    const data = await supabaseAdminFetch('photos', params);
    res.json({ success: true, data: Array.isArray(data) ? data[0] || null : null });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端照片读取失败');
  }
});

app.post('/api/admin/photos', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { upload_id: uploadId, ...photo } = req.body;
    const data = await photoUploads.createPhoto(photo, uploadId);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端照片创建失败');
  }
});

app.post('/api/admin/photos/upsert', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await supabaseAdminFetch('photos', new URLSearchParams({
      on_conflict: 'id',
      select: PHOTO_SELECT_FIELDS,
    }), {
      method: 'POST',
      body: req.body,
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    res.json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端照片 upsert 失败');
  }
});

app.patch('/api/admin/photos/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await supabaseAdminFetch('photos', new URLSearchParams({
      id: `eq.${req.params.id}`,
      select: PHOTO_SELECT_FIELDS,
    }), {
      method: 'PATCH',
      body: req.body,
      prefer: 'return=representation',
    });
    res.json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端照片更新失败');
  }
});

app.delete('/api/admin/photos/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await photoDeletion.removePhoto(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端照片删除失败');
  }
});

app.get('/api/admin/app-settings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await supabaseAdminFetch('app_settings', new URLSearchParams({
      select: 'id,data,updated_at',
      id: `eq.${req.params.id}`,
      limit: '1',
    }));
    res.json({ success: true, data: Array.isArray(data) ? data[0] || null : null });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端配置读取失败');
  }
});

app.put('/api/admin/app-settings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await supabaseAdminFetch('app_settings', new URLSearchParams({
      on_conflict: 'id',
      select: 'id,data,updated_at',
    }), {
      method: 'POST',
      body: {
        id: req.params.id,
        data: req.body?.data || {},
        updated_at: new Date().toISOString(),
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    res.json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '管理端配置保存失败');
  }
});

app.put('/api/admin/brand-settings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await supabaseAdminFetch('brand_settings', new URLSearchParams({
      on_conflict: 'id',
      select: '*',
    }), {
      method: 'POST',
      body: {
        ...req.body,
        id: req.params.id,
        updated_at: new Date().toISOString(),
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    res.json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '品牌配置保存失败');
  }
});

app.delete('/api/admin/brand-settings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await supabaseAdminFetch('brand_settings', new URLSearchParams({
      id: `eq.${req.params.id}`,
      select: 'id',
    }), {
      method: 'DELETE',
      prefer: 'return=representation',
    });
    res.json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '品牌配置删除失败');
  }
});

app.post('/api/admin/gear-presets', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, name } = req.body || {};
    if (!['camera', 'lens'].includes(type) || !String(name || '').trim()) {
      return res.status(400).json({ error: '无效的器材预设' });
    }
    const data = await supabaseAdminFetch('gear_presets', new URLSearchParams({
      on_conflict: 'type,name',
      select: 'type,name',
    }), {
      method: 'POST',
      body: { type, name: String(name).trim() },
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    res.json({ success: true, data });
  } catch (error) {
    sendSupabaseAdminError(res, error, '器材预设保存失败');
  }
});

// 生产模式：服务前端构建文件
if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
  const DIST_DIR = path.join(__dirname, '..', 'dist');
  // 服务静态资源文件
  app.use('/assets', express.static(path.join(DIST_DIR, 'assets')));
  // 服务其他静态文件（如 favicon 等）
  app.use(express.static(DIST_DIR));
  // 所有非 API 路由都返回 index.html（用于 React Router）
  app.get('/{*splat}', (req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    } else {
      next();
    }
  });
}

// 错误处理中间件
app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制（最大 100MB）' });
    }
    if (error.code === 'LIMIT_FIELD_SIZE') {
      return res.status(400).json({ error: '字段大小超过限制（最大 10MB）' });
    }
    logger.warn(`Multer error: ${error.code} - ${error.message}`);
    return res.status(400).json({ error: `上传错误: ${error.message}` });
  }

  logger.error(`Server error: ${error.message}`, { stack: error.stack });
  res.status(500).json({ 
    error: error.message || '服务器错误',
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// 监听地址：生产环境监听所有接口，开发环境只监听 localhost
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

app.listen(PORT, HOST, () => {
  if (isSupabaseAdminConfigured()) {
    void photoDeletion.retryPending();
    setInterval(() => { void photoDeletion.retryPending(); }, 5 * 60 * 1000).unref();
    void photoUploads.retryPending();
    setInterval(() => { void photoUploads.retryPending(); }, 5 * 60 * 1000).unref();
  }
  logger.info(`🚀 服务器运行在 http://${HOST}:${PORT}`);
  console.log(`📁 上传目录: ${UPLOAD_DIR}`);
  console.log(`🌐 静态文件: http://${HOST}:${PORT}/uploads/pic4pick/`);
  console.log(`📝 日志目录: ${LOG_DIR}`);
  console.log(`✅ JWT 认证已启用`);
  console.log(`✅ Winston 日志系统已启用`);
  if (HOST === '0.0.0.0') {
    console.log(`🌍 服务器监听所有网络接口，可通过外部访问`);
  }
});
