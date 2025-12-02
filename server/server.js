import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import OSS from 'ali-oss';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

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
    fileSize: 10 * 1024 * 1024 // 10MB
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

// 初始化阿里云 OSS 客户端（如果配置了）
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

// 上传到阿里云 OSS（后端代理）
app.post('/api/upload/oss', upload.single('file'), async (req, res) => {
  try {
    if (!ossClient) {
      return res.status(500).json({ error: 'OSS 客户端未配置，请检查环境变量' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const file = req.file;
    const filename = req.body.filename || file.filename;
    const objectKey = `pic4pick/${filename}`;

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

// 错误处理中间件
app.use((error, req, res, next) => {
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

