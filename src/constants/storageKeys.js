/**
 * 统一的存储键名常量
 * 所有 localStorage 键名应在此定义，避免硬编码和拼写错误
 */

// 照片相关
export const STORAGE_KEYS = {
  // 管理员上传的作品（待审核）
  ADMIN_UPLOADS: 'camarts_admin_uploads',
  
  // 已审核通过的作品
  APPROVED_PHOTOS: 'camarts_approved_photos',
  
  // 已拒绝的作品
  REJECTED_PHOTOS: 'camarts_rejected_photos',
  
  // 用户点赞的作品 ID 列表
  LIKED_PHOTOS: 'camarts_liked_photos',
  
  // 当前激活的视图（gallery-view | explore-view）
  ACTIVE_VIEW: 'camarts_active_view',
  
  // 管理员认证状态
  ADMIN_AUTHED: 'admin_authed',
  
  // JWT 认证 Token
  AUTH_TOKEN: 'auth_token',
  
  // 常用相机选项
  ADMIN_CAMERA_OPTIONS: 'admin_camera_options',
  
  // 常用镜头选项
  ADMIN_LENS_OPTIONS: 'admin_lens_options',
  
  // 品牌 Logo
  BRAND_LOGO: 'camarts_brand_logo',
  
  // 品牌文案（标题、副标题）
  BRAND_TEXT: 'camarts_brand_text',
  
  // 环境变量覆盖配置
  ENV_OVERRIDES: 'pic4pick_env_overrides',
  
  // 上传配置
  UPLOAD_TYPE: 'upload_type',
  API_UPLOAD_URL: 'api_upload_url',
  API_OPTIMIZE: 'api_optimize',
  
  // Cloudinary 配置
  CLOUDINARY_CLOUD_NAME: 'cloudinary_cloud_name',
  CLOUDINARY_UPLOAD_PRESET: 'cloudinary_upload_preset',
  
  // Supabase 配置
  SUPABASE_URL: 'supabase_url',
  SUPABASE_ANON_KEY: 'supabase_anon_key',
  SUPABASE_BUCKET: 'supabase_bucket',
  
  // 阿里云 OSS 配置
  ALIYUN_OSS_BACKEND_URL: 'aliyun_oss_backend_url',
  ALIYUN_OSS_REGION: 'aliyun_oss_region',
  ALIYUN_OSS_BUCKET: 'aliyun_oss_bucket',
  ALIYUN_OSS_ACCESS_KEY_ID: 'aliyun_oss_access_key_id',
  ALIYUN_OSS_ACCESS_KEY_SECRET: 'aliyun_oss_access_key_secret',
};

