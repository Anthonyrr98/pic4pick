/**
 * 文件上传管理 Hook
 */

import { useState, useCallback } from 'react';
import { uploadImage, getUploadType, UPLOAD_TYPES } from '../utils/upload';
import { getUploadTypeName } from '../utils/adminUtils';
import { handleError, formatErrorMessage, ErrorType } from '../utils/errorHandler';

export const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadingFileName, setUploadingFileName] = useState(null);
  const [uploadBytes, setUploadBytes] = useState({ uploaded: 0, total: 0 });

  /**
   * 上传文件
   */
  const uploadFile = useCallback(async (file, filename, onProgress) => {
    setIsUploading(true);
    setUploadingFileName(filename);
    setUploadProgress(0);
    setUploadBytes({ uploaded: 0, total: file.size });

    try {
      const result = await uploadImage(
        file,
        filename,
        (progress) => {
          setUploadProgress(progress);
          if (onProgress) {
            onProgress(progress);
          }
        }
      );

      // 延迟隐藏进度条，让用户看到100%完成
      setTimeout(() => {
        setUploadProgress(null);
        setUploadingFileName(null);
        setUploadBytes({ uploaded: 0, total: 0 });
      }, 500);

      return result;
    } catch (error) {
      const appError = handleError(error, {
        context: 'uploadFile',
        type: ErrorType.NETWORK,
      });
      setUploadProgress(null);
      setUploadingFileName(null);
      setUploadBytes({ uploaded: 0, total: 0 });
      throw appError;
    } finally {
      setIsUploading(false);
    }
  }, []);

  /**
   * 重置上传状态
   */
  const resetUploadState = useCallback(() => {
    setIsUploading(false);
    setUploadProgress(null);
    setUploadingFileName(null);
    setUploadBytes({ uploaded: 0, total: 0 });
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadingFileName,
    uploadBytes,
    uploadFile,
    resetUploadState,
  };
};

