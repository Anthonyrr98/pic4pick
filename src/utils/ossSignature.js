/**
 * 阿里云 OSS 签名工具
 * 用于前端直传时生成 OSS 签名
 */

/**
 * 使用 Web Crypto API 计算 HMAC-SHA1
 */
async function hmacSha1(key, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // 转换为 Base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * 生成 OSS 签名
 * @param {string} accessKeyId - AccessKey ID
 * @param {string} accessKeySecret - AccessKey Secret
 * @param {string} method - HTTP 方法 (PUT, POST, GET, DELETE)
 * @param {string} bucket - Bucket 名称
 * @param {string} objectKey - 对象键（文件路径）
 * @param {string} contentType - Content-Type
 * @param {string} date - 日期字符串（ISO 8601 格式）
 * @param {Object} headers - 额外的请求头
 * @returns {string} 签名字符串
 */
export async function generateOSSSignature({
  accessKeyId,
  accessKeySecret,
  method = 'PUT',
  bucket,
  objectKey,
  contentType = '',
  date
}) {
  // 构建 Canonical String
  // 格式：Method\nContent-MD5\nContent-Type\nDate\nCanonicalizedOSSHeaders\nCanonicalizedResource
  
  const contentMD5 = ''; // PUT 请求通常不需要 MD5
  const canonicalOSSHeaders = ''; // 简化处理，不包含自定义 OSS 头部
  const canonicalizedResource = `/${bucket}/${objectKey}`;
  
  // 构建签名字符串
  const stringToSign = [
    method,
    contentMD5,
    contentType,
    date,
    canonicalOSSHeaders,
    canonicalizedResource
  ].join('\n');

  console.log('[OSS Signature] String to sign:', stringToSign);

  // 计算 HMAC-SHA1 签名
  const signature = await hmacSha1(accessKeySecret, stringToSign);

  // 构建 Authorization 头部
  const authorization = `OSS ${accessKeyId}:${signature}`;

  return authorization;
}

/**
 * 生成 OSS PUT 请求的签名
 * 参考：https://help.aliyun.com/document_detail/31951.html
 */
export async function generateOSSPutSignature({
  accessKeyId,
  accessKeySecret,
  bucket,
  objectKey,
  contentType = 'application/octet-stream',
  acl = 'public-read'
}) {
  const date = new Date().toUTCString();
  
  // OSS 签名字符串格式：
  // Method\n
  // Content-MD5\n
  // Content-Type\n
  // Date\n
  // CanonicalizedOSSHeaders\n
  // CanonicalizedResource
  
  const canonicalizedResource = `/${bucket}/${objectKey}`;
  
  // 构建 CanonicalizedOSSHeaders（以 x-oss- 开头的头部，按字典序排序）
  const ossHeaders = {
    'x-oss-object-acl': acl
  };
  
  // 排序并格式化 OSS 头部
  const sortedHeaders = Object.keys(ossHeaders)
    .sort()
    .map(key => `${key.toLowerCase()}:${ossHeaders[key]}`)
    .join('\n');
  
  // 如果有 OSS 头部，需要添加换行符
  const canonicalizedOSSHeaders = sortedHeaders ? sortedHeaders + '\n' : '';
  
  // 构建签名字符串
  const stringToSign = [
    'PUT',
    '', // Content-MD5（PUT 请求通常为空）
    contentType,
    date,
    canonicalizedOSSHeaders + canonicalizedResource
  ].join('\n');

  console.log('[OSS Signature] String to sign:', stringToSign.replace(/\n/g, '\\n'));

  // 计算 HMAC-SHA1 签名
  const signature = await hmacSha1(accessKeySecret, stringToSign);

  // 构建 Authorization 头部
  // 格式：OSS AccessKeyId:Signature
  const authorization = `OSS ${accessKeyId}:${signature}`;

  return {
    authorization,
    date
  };
}

