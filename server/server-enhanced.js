import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import OSS from 'ali-oss';
import dotenv from 'dotenv';
import { createClient } from 'webdav';
import winston from 'winston';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 增加到 15MB
  },
  fileFilter: fileFilter
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

// WebDAV 连接缓存
const webdavClients = new Map();

// 获取 WebDAV 客户端
const getWebDAVClient = (credentials) => {
  const cacheKey = `${credentials.url}:${credentials.username}`;

  if (webdavClients.has(cacheKey)) {
    return webdavClients.get(cacheKey);
  }

  const client = createClient(credentials.url, {
    username: credentials.username,
    password: credentials.password
  });

  webdavClients.set(cacheKey, client);
  return client;
};

// === WebDAV 代理 API ===

// 测试 WebDAV 连接
app.post('/api/webdav/test', authenticateToken, async (req, res) => {
  try {
    const { url, username, password } = req.body;

    if (!url || !username || !password) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const client = getWebDAVClient({ url, username, password });

    // 测试连接
    await client.getDirectoryContents('/');

    logger.info(`WebDAV connection test successful for: ${url}`);

    res.json({
      success: true,
      message: '连接成功',
      server: url
    });
  } catch (error) {
    logger.error(`WebDAV connection test failed: ${error.message}`);
    res.status(500).json({ error: `连接失败: ${error.message}` });
  }
});

// 上传文件到 WebDAV
app.post('/api/webdav/upload', authenticateToken, upload.single('file'), async (req, res) => {
  let tempFilePath = null;

  try {
    const { webdavUrl, username, password, remotePath = '' } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    if (!webdavUrl || !username || !password) {
      return res.status(400).json({ error: '缺少 WebDAV 配置' });
    }

    const client = getWebDAVClient({
      url: webdavUrl,
      username,
      password
    });

    tempFilePath = req.file.path;

    // 生成远程文件路径
    const remoteFilename = `${Date.now()}-${req.file.originalname}`;
    const fullRemotePath = path.posix.join('/', remotePath, remoteFilename);

    // 读取文件内容
    const fileBuffer = fs.readFileSync(tempFilePath);

    // 上传到 WebDAV
    await client.createFile(fullRemotePath, fileBuffer);

    // 获取文件链接（如果是坚果云等支持公共访问的）
    const fileUrl = `${webdavUrl.replace(/\/$/, '')}${fullRemotePath}`;

    logger.info(`WebDAV upload successful: ${fullRemotePath}`);

    res.json({
      success: true,
      url: fileUrl,
      filename: remoteFilename,
      originalName: req.file.originalname,
      size: req.file.size,
      remotePath: fullRemotePath,
      message: '上传到 WebDAV 成功'
    });

  } catch (error) {
    logger.error(`WebDAV upload failed: ${error.message}`);
    res.status(500).json({ error: `上传失败: ${error.message}` });
  } finally {
    // 清理临时文件
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// 从 WebDAV 删除文件
app.delete('/api/webdav/delete', authenticateToken, async (req, res) => {
  try {
    const { webdavUrl, username, password, remotePath } = req.body;

    if (!webdavUrl || !username || !password || !remotePath) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const client = getWebDAVClient({
      url: webdavUrl,
      username,
      password
    });

    await client.deleteFile(remotePath);

    logger.info(`WebDAV delete successful: ${remotePath}`);

    res.json({
      success: true,
      message: '从 WebDAV 删除成功',
      remotePath
    });

  } catch (error) {
    logger.error(`WebDAV delete failed: ${error.message}`);
    res.status(500).json({ error: `删除失败: ${error.message}` });
  }
});

// === 现有 API（保持兼容）===

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常' });
});

// 上传本地图片
app.post('/api/upload', upload.single('file'), async (req, res) => {
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
app.delete('/api/upload/:filename', (req, res) => {
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
  ossClient = new OSS({
    region: process.env.ALIYUN_OSS_REGION,
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    bucket: process.env.ALIYUN_OSS_BUCKET,
  });
  console.log('✅ 阿里云 OSS 客户端已初始化');
}

// 上传到阿里云 OSS
app.post('/api/upload/oss', upload.single('file'), async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const file = req.file;
    const filename = req.body.filename || file.filename;
    const objectKey = `pic4pick/${filename}`;

    let fileBuffer = fs.readFileSync(file.path);
    if (req.body.optimize === 'true') {
      fileBuffer = await sharp(file.path)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    const result = await ossClient.put(objectKey, fileBuffer, {
      headers: {
        'Content-Type': file.mimetype,
        'x-oss-object-acl': 'public-read',
      },
    });

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
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message || 'OSS 上传失败' });
  }
});

// 从 OSS 删除文件
app.delete('/api/upload/oss/:filename', async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置' });
    }

    const filename = req.params.filename;
    const objectKey = `pic4pick/${filename}`;

    await ossClient.delete(objectKey);

    res.json({ success: true, message: '从 OSS 删除成功' });
  } catch (error) {
    console.error('OSS 删除错误:', error);
    res.status(500).json({ error: error.message || '删除失败' });
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

    const hashedPassword = await bcrypt.hash(password, 10);

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

    // 示例验证（实际应查询数据库）
    const isValidPassword = password === 'admin123';

    if (!isValidPassword) {
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
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制（最大 15MB）' });
    }
  }

  logger.error(`Server error: ${error.message}`, { stack: error.stack });
  res.status(500).json({ error: error.message || '服务器错误' });
});

app.listen(PORT, () => {
  logger.info(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📁 上传目录: ${UPLOAD_DIR}`);
  console.log(`🌐 静态文件: http://localhost:${PORT}/uploads/pic4pick/`);
  console.log(`📝 日志目录: ${LOG_DIR}`);
  console.log(`✅ WebDAV 代理已启用`);
  console.log(`✅ JWT 认证已启用`);
  console.log(`✅ Winston 日志系统已启用`);
});