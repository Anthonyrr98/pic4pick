// Keep an attempt stable across failed saves and page reloads. Only public URLs
// and a content hash are cached; the original file remains in the browser form.
export const createPhotoSubmission = ({ uploadImage, createPhoto, storage, uuid = () => crypto.randomUUID(),
  digest = async (file) => {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  },
}) => {
  let current;
  const getUpload = async (file, type, onProgress, trackUpload) => {
    if (!current || current.file !== file || current.type !== type || current.trackUpload !== trackUpload) {
      const hash = await digest(file);
      const key = `admin_photo_submission:${trackUpload ? 'cloud' : 'local'}:${type}:${hash}`;
      const stored = storage.get(key);
      const id = stored?.id || uuid();
      current = { file, type, trackUpload, key, id, filename: stored?.filename || `${id}.${file.name.split('.').pop()}`,
        result: stored?.result || null };
    }
    const attempt = current;
    const persist = () => storage.set(attempt.key, { id: attempt.id, filename: attempt.filename,
      result: type === 'base64' ? null : attempt.result });
    // Persist the id before the first network write, including a lost response.
    persist();
    if (!attempt.result) {
      attempt.result = await uploadImage(file, attempt.filename, onProgress, type,
        trackUpload ? { uploadId: attempt.id } : {});
      if (!attempt.result?.url) {
        attempt.result = null;
        throw new Error('上传服务未返回图片地址，请重试');
      }
      persist();
    } else {
      onProgress?.(98, file.size, file.size, { stage: 'complete', label: '复用已上传照片，正在保存作品信息...' });
    }
    return attempt;
  };

  const commit = async (attempt, photo) => {
    try {
      const data = await createPhoto(photo, attempt.result.uploadId);
      complete(attempt);
      return data;
    } catch (error) {
      if (error.status === 410) {
        // The server may have reclaimed an abandoned upload after 48 hours.
        attempt.result = null;
        storage.set(attempt.key, { id: attempt.id, filename: attempt.filename, result: null });
      }
      throw error;
    }
  };
  const complete = (attempt) => {
    storage.remove(attempt.key);
    if (current === attempt) current = null;
  };
  return { getUpload, commit, complete };
};
