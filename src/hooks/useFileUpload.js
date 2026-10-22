/**
 * 文件上传管理 Hook
 */

import { useState } from 'react';

export const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadingFileName, setUploadingFileName] = useState(null);
  const [uploadBytes, setUploadBytes] = useState({ uploaded: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState('');

  // 返回所有状态和函数
  return {
    isUploading,
    uploadProgress,
    uploadingFileName,
    uploadBytes,
    uploadStatus,
    // 导出 setter 函数，供外部手动控制状态
    setIsUploading,
    setUploadProgress,
    setUploadingFileName,
    setUploadBytes,
    setUploadStatus,
  };
};

