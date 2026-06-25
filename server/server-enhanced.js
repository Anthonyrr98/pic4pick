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

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 设置服务器级别的超时（10分钟，适合大文件上传）
app.timeout = 10 * 60 * 1000;

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
// 配置 CORS，允许所有来源（生产环境建议限制特定域名）
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24小时
  optionsSuccessStatus: 200 // 兼容旧版浏览器
};

app.use(cors(corsOptions));

// 处理预检请求
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// 配置 multer，设置合理的文件大小限制（50MB）
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
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
  res.json({ status: 'ok', message: '服务器运行正常' });
});

// 上传本地图片
app.post('/api/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const file = req.file;
    const filename = req.body.filename || file.filename;

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
    const filename = req.params.filename;
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
app.get('/api/images', (req, res) => {
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

// 初始化阿里云 OSS 客户端
let ossClient = null;
if (process.env.ALIYUN_OSS_REGION && process.env.ALIYUN_OSS_BUCKET &&
    process.env.ALIYUN_OSS_ACCESS_KEY_ID && process.env.ALIYUN_OSS_ACCESS_KEY_SECRET) {
  // 自动处理 Region 格式：如果用户输入的是 cn-beijing，自动转换为 oss-cn-beijing
  let region = process.env.ALIYUN_OSS_REGION.trim();
  if (!region.startsWith('oss-')) {
    region = `oss-${region}`;
  }
  
  ossClient = new OSS({
    region: region,
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    bucket: process.env.ALIYUN_OSS_BUCKET,
  });
  logger.info(`✅ 阿里云 OSS 客户端已初始化 (Region: ${region}, Bucket: ${process.env.ALIYUN_OSS_BUCKET})`);
}

const OSS_OBJECT_KEY_PREFIX_RE = /^(origin|ore|pic4pick)\//;

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
app.get('/api/media/proxy', async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(503).json({ error: 'OSS 客户端未配置' });
    }
    const objectKey = parseAllowedOssObjectKey(req.query.url);
    if (!objectKey) {
      return res.status(400).json({ error: '无效或不允许的 OSS URL' });
    }
    const result = await ossClient.getStream(objectKey);
    const contentType = result.res?.headers?.['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    result.stream.pipe(res);
  } catch (error) {
    logger.warn(`OSS 代理读取失败: ${error.message}`);
    res.status(404).json({ error: '文件不存在或无法读取' });
  }
});

// 上传到阿里云 OSS
app.post('/api/upload/oss', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  // 设置较长的超时时间（5分钟）
  req.setTimeout(5 * 60 * 1000);
  
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
    const filename = req.body.filename || file.filename;
    // 原图放在 origin 目录，缩略图放在 ore 目录
    const originKey = `origin/${filename}`;
    const thumbKey = `ore/${filename}`;

    // 处理原图：根据 EXIF Orientation 自动旋转并去除 EXIF（避免浏览器再次旋转）
    let processedOriginBuffer;
    try {
      const originImage = sharp(file.path);
      // 根据 EXIF Orientation 旋转图片，并移除 EXIF（避免浏览器重复旋转）
      processedOriginBuffer = await originImage
        .rotate() // 自动根据 EXIF Orientation 旋转
        .resize(req.body.optimize === 'true' ? 1920 : null, req.body.optimize === 'true' ? 1920 : null, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: req.body.optimize === 'true' ? 85 : 95 })
        .toBuffer();
    } catch (originError) {
      logger.warn('处理原图失败，使用原始文件:', originError.message || originError);
      processedOriginBuffer = fs.readFileSync(file.path);
    }

    // 生成缩略图（较小尺寸，并按 EXIF 自动旋转）
    let thumbBuffer;
    try {
      const thumbImage = sharp(file.path);
      // 读取元数据确保能获取 EXIF
      await thumbImage.metadata();
      
      thumbBuffer = await thumbImage
        .rotate() // 根据 EXIF Orientation 自动旋转
        .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (thumbError) {
      logger.warn('生成缩略图失败，仅上传原图:', thumbError.message || thumbError);
      thumbBuffer = null;
    }

    // 上传原图到 origin 目录（已根据 EXIF 旋转）
    const originResult = await ossClient.put(originKey, processedOriginBuffer, {
      headers: {
        'Content-Type': 'image/jpeg', // 统一为 JPEG（因为经过 sharp 处理）
        'x-oss-object-acl': 'public-read',
      },
    });

    // 如果缩略图生成成功，则上传到 ore 目录
    let thumbResult = null;
    if (thumbBuffer) {
      thumbResult = await ossClient.put(thumbKey, thumbBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'x-oss-object-acl': 'public-read',
        },
      });
    }

    fs.unlinkSync(file.path);

    logger.info(`OSS 上传成功: ${filename}, 原图: ${originResult.url}, 缩略图: ${thumbResult ? thumbResult.url : '无'}`);

    res.json({
      success: true,
      url: originResult.url,
      thumbnailUrl: thumbResult ? thumbResult.url : null,
      filename: filename,
      originalName: file.originalname,
      size: file.size,
      message: '上传到 OSS 成功'
    });
  } catch (error) {
    logger.error('OSS 上传错误:', error);
    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.warn('清理临时文件失败:', unlinkError);
      }
    }
    
    // 返回详细的错误信息
    const errorMessage = error.message || 'OSS 上传失败';
    logger.error(`OSS 上传失败: ${errorMessage}`);
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 从 OSS 删除文件
app.delete('/api/upload/oss/:filename(*)', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置' });
    }

    // filename 可能包含路径，例如 "origin/filename.jpg" 或 "ore/filename.jpg"
    const filename = req.params.filename;
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
        await ossClient.delete(objectKey);
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

// 用户注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    logger.info(`User registered: ${username}`);

    res.json({
      success: true,
      message: '注册成功',
      username
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    res.status(500).json({ error: '注册失败' });
  }
});

// 用户登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const isValidUsername = username === ADMIN_USERNAME;
    const isValidPassword = password === ADMIN_PASSWORD;

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

// 生产模式：服务前端构建文件
if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
  const DIST_DIR = path.join(__dirname, '..', 'dist');
  // 服务静态资源文件
  app.use('/assets', express.static(path.join(DIST_DIR, 'assets')));
  // 服务其他静态文件（如 favicon 等）
  app.use(express.static(DIST_DIR));
  // 所有非 API 路由都返回 index.html（用于 React Router）
  app.get('*', (req, res, next) => {
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
      return res.status(400).json({ error: '文件大小超过限制（最大 50MB）' });
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
