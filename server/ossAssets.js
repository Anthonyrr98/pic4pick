export const getPhotoOssAssets = (photo, bucket) => {
  const assets = new Map();
  for (const url of [photo.image_url, photo.thumbnail_url]) {
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith('.aliyuncs.com')) continue;
      if (bucket && !parsed.hostname.startsWith(`${bucket}.`)) continue;
      const key = decodeURIComponent(parsed.pathname.slice(1));
      if (!/^(origin|ore|pic4pick)\//.test(key) || key.includes('\\') || key.split('/').includes('..')) continue;
      assets.set(key, { key, url });
    } catch {
      // Non-OSS images are not owned by this cleanup worker.
    }
  }
  return [...assets.values()];
};

export const deleteUnreferencedOssAsset = async ({ asset, db, deleteObject, bucket, mismatchMessage }) => {
  const { key, url } = asset;

  if (!getPhotoOssAssets({ image_url: url }, bucket).some((asset) => asset.key === key)) {
    throw new Error(mismatchMessage);
  }
  // Match the object path even if another record uses HTTP, a signed URL,
  // or an OSS image-processing query on the same underlying object.
  const escapedKey = key.replaceAll('"', '\\"');
  const references = await db('photos', new URLSearchParams({
    select: 'id', or: `(image_url.like."*/${escapedKey}*",thumbnail_url.like."*/${escapedKey}*")`, limit: '1',
  }));
  if (references?.length) return;
  try {
    await deleteObject(key);
  } catch (error) {
    if (error.code !== 'NoSuchKey' && error.status !== 404) throw error;
  }
};
