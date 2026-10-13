import OSS from 'ali-oss';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function spatialDepthKey(photoId, generation, depthPath = `${photoId}/${generation}.png`) {
  if (!uuid.test(photoId) || !uuid.test(generation) || depthPath !== `${photoId}/${generation}.png`) {
    throw new Error('Invalid spatial depth path');
  }
  return `spatial-depth/${depthPath}`;
}

export function createSpatialOssClient(env = process.env) {
  if (!env.ALIYUN_OSS_BUCKET || !env.ALIYUN_OSS_REGION || !env.ALIYUN_OSS_ACCESS_KEY_ID || !env.ALIYUN_OSS_ACCESS_KEY_SECRET) {
    throw new Error('Spatial OSS storage is not configured');
  }
  return new OSS({
    region: env.ALIYUN_OSS_REGION.startsWith('oss-') ? env.ALIYUN_OSS_REGION : `oss-${env.ALIYUN_OSS_REGION}`,
    bucket: env.ALIYUN_OSS_BUCKET,
    accessKeyId: env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    secure: true, timeout: 60_000,
  });
}

export async function uploadSpatialDepth(client, photoId, generation, png) {
  if (!Buffer.isBuffer(png) || png.length > 1048576 || png.length < 24
    || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid depth PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 1024 || height > 1024) throw new Error('Invalid depth dimensions');
  await client.put(spatialDepthKey(photoId, generation), png, {
    mime: 'image/png', headers: { 'x-oss-object-acl': 'private', 'Cache-Control': 'private, max-age=300' },
  });
}

export function createSpatialDepthHandler({ db, getClient, logger }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const photoId = req.params.id;
    if (!uuid.test(photoId)) return res.status(400).json({ error: '无效的照片编号' });
    try {
      // The admin DB client bypasses RLS: repeat the public visibility check here.
      const photos = await db('photos', new URLSearchParams({ select: 'id,status,hidden', id: `eq.${photoId}`, limit: '1' }));
      if (!photos[0] || photos[0].status !== 'approved' || photos[0].hidden === true) return res.status(404).json({ error: '照片不可访问' });
      const rows = await db('photo_spatial', new URLSearchParams({ select: 'generation,status,storage_backend,depth_path', photo_id: `eq.${photoId}`, limit: '1' }));
      const row = rows[0];
      if (!row || row.status !== 'ready' || row.storage_backend !== 'oss') return res.status(404).json({ error: '空间照片尚未就绪' });
      const key = spatialDepthKey(photoId, row.generation, row.depth_path);
      const signedUrl = getClient().signatureUrl(key, { expires: 300, method: 'GET' });
      return res.json({ signedUrl, expiresIn: 300, generation: row.generation });
    } catch (error) {
      // SDK errors can contain signed URLs. Never log credentials or signatures.
      logger?.warn('Spatial depth signing failed', { code: error.code || 'SpatialDepthError' });
      return res.status(503).json({ error: '空间照片读取失败，请稍后重试' });
    }
  };
}
