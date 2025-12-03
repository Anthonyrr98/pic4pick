/**
 * 工具面板组件
 * 图片压缩工具
 */

import { useState } from 'react';
import exifr from 'exifr';
import { compressImage } from '../../utils/upload';
import { handleError, ErrorType } from '../../utils/errorHandler';

export const ToolsPanel = () => {
  const [toolFile, setToolFile] = useState(null);
  const [toolOriginalPreview, setToolOriginalPreview] = useState('');
  const [toolCompressedPreview, setToolCompressedPreview] = useState('');
  const [toolMessage, setToolMessage] = useState({ type: '', text: '' });
  const [toolLoading, setToolLoading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setToolMessage({ type: '', text: '' });
    setToolFile(file);

    // 原图预览
    const reader = new FileReader();
    reader.onload = () => {
      setToolOriginalPreview(reader.result?.toString() || '');
    };
    reader.readAsDataURL(file);

    // 立即压缩，仅在本地保存
    try {
      setToolLoading(true);
      const compressed = await compressImage(file, {
        maxWidth: 2560,
        maxHeight: 2560,
        quality: 0.85,
      });

      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const originalFilename = file.name || `image.${ext}`;
      const compressedFilename = `${nameWithoutExt}pre.${ext}`;

      // 预览压缩结果
      const compressedUrl = compressed instanceof File ? URL.createObjectURL(compressed) : '';
      setToolCompressedPreview(compressedUrl);

      // 在浏览器中触发下载，让用户保存到同一文件夹
      const triggerDownload = (blobFile, filename) => {
        const url = blobFile instanceof File ? URL.createObjectURL(blobFile) : '';
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };

      // 1) 原图
      triggerDownload(file, originalFilename);
      // 2) 压缩图
      triggerDownload(compressed, compressedFilename);

      // 3) 读取 EXIF 参数并生成同名 txt
      let focal = '';
      let fNumber = '';
      let shutter = '';
      let iso = '';
      let camera = '';
      let lens = '';
      let shotDate = '';

      try {
        const exif = await exifr.parse(file);

        // 焦距
        const rawFocal =
          exif?.FocalLengthIn35mm ||
          exif?.focalLengthIn35mm ||
          exif?.FocalLength ||
          exif?.focalLength ||
          exif?.LensFocalLength ||
          exif?.lensFocalLength ||
          null;
        if (typeof rawFocal === 'number') {
          focal = `${Math.round(rawFocal)}mm`;
        } else if (rawFocal != null && rawFocal.toString) {
          focal = `${rawFocal.toString()}mm`;
        }

        // 光圈
        const rawFNumber =
          exif?.FNumber ||
          exif?.fNumber ||
          exif?.ApertureValue ||
          exif?.apertureValue ||
          null;
        if (typeof rawFNumber === 'number') {
          fNumber = `f/${rawFNumber.toFixed(1)}`;
        } else if (rawFNumber != null && rawFNumber.toString) {
          fNumber = `f/${rawFNumber.toString()}`;
        }

        // 快门
        const rawExposure =
          exif?.ExposureTime ||
          exif?.exposureTime ||
          exif?.ShutterSpeedValue ||
          exif?.shutterSpeedValue ||
          null;
        if (typeof rawExposure === 'number') {
          if (rawExposure >= 1) {
            shutter = `${rawExposure.toFixed(1)}s`;
          } else {
            const denom = Math.round(1 / rawExposure);
            shutter = `1/${denom}s`;
          }
        } else if (rawExposure != null && rawExposure.toString) {
          shutter = rawExposure.toString();
        }

        // ISO
        iso =
          exif?.ISO ||
          exif?.iso ||
          exif?.ISOSpeedRatings ||
          exif?.isoSpeedRatings ||
          exif?.PhotographicSensitivity ||
          exif?.photographicSensitivity ||
          '';

        // 拍摄日期
        const rawDate =
          exif?.DateTimeOriginal ||
          exif?.dateTimeOriginal ||
          exif?.CreateDate ||
          exif?.createDate ||
          exif?.DateTimeDigitized ||
          exif?.dateTimeDigitized ||
          exif?.ModifyDate ||
          exif?.modifyDate;
        if (rawDate instanceof Date) {
          const y = rawDate.getFullYear();
          const m = String(rawDate.getMonth() + 1).padStart(2, '0');
          const d = String(rawDate.getDate()).padStart(2, '0');
          shotDate = `${y}-${m}-${d}`;
        } else if (typeof rawDate === 'string') {
          const normalized = rawDate.replace(/:/g, '-').replace(' ', 'T');
          const parsed = new Date(normalized);
          if (!Number.isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            shotDate = `${y}-${m}-${d}`;
          } else {
            shotDate = rawDate;
          }
        }

        // 相机 / 镜头
        camera =
          exif?.Model ||
          exif?.model ||
          exif?.BodySerialNumber ||
          exif?.bodySerialNumber ||
          '';
        lens =
          exif?.LensModel ||
          exif?.lensModel ||
          exif?.Lens ||
          exif?.lens ||
          exif?.LensSpecification ||
          exif?.lensSpecification ||
          '';
      } catch (exifError) {
        // 读取 EXIF 失败，使用空模板
      }

      const lines = [];
      lines.push(`焦距: ${focal || ''}`);
      lines.push(`光圈: ${fNumber || ''}`);
      lines.push(`快门: ${shutter || ''}`);
      lines.push(`ISO: ${iso || ''}`);
      lines.push(`相机: ${camera || ''}`);
      lines.push(`镜头: ${lens || ''}`);
      lines.push(`拍摄日期: ${shotDate || ''}`);

      const txtContent = lines.join('\n');
      const txtBlob = new Blob([txtContent], {
        type: 'text/plain;charset=utf-8',
      });
      const txtFile = new File([txtBlob], `${nameWithoutExt}.txt`, {
        type: 'text/plain;charset=utf-8',
      });
      triggerDownload(txtFile, `${nameWithoutExt}.txt`);

      setToolMessage({
        type: 'success',
        text: '已在本地生成原图、压缩图和参数 txt（焦距、光圈、快门、ISO、相机、镜头、拍摄日期），请在下载对话框中选择同一文件夹保存。',
      });
    } catch (error) {
      handleError(error, {
        context: 'handleCompressImage',
        type: ErrorType.UNKNOWN,
        silent: true,
      });
      setToolMessage({
        type: 'error',
        text: `处理失败：${error.message || '未知错误'}`,
      });
    } finally {
      setToolLoading(false);
    }
  };

  return (
    <section>
      <h2 className="form-section-title">图片压缩工具</h2>
      <p style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '0.9rem' }}>
        上传一张图片，系统会在浏览器内进行压缩处理（尽量不影响画质），并在处理完成后
        <strong> 仅在本地生成原图和压缩图文件 </strong>，你可以选择同一个文件夹进行保存。
      </p>

      {toolMessage.text && (
        <div className={`admin-message ${toolMessage.type}`} style={{ marginBottom: '12px' }}>
          {toolMessage.text}
        </div>
      )}

      <div className="upload-dropzone-new" style={{ marginBottom: '20px' }}>
        <input
          type="file"
          accept="image/*"
          id="tool-file-upload"
          onChange={handleFileChange}
          disabled={toolLoading}
        />
        <label htmlFor="tool-file-upload" className="dropzone-label">
          {toolOriginalPreview ? (
            <div className="preview-container">
              <img src={toolOriginalPreview} alt="原图预览" />
              {toolCompressedPreview && (
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '8px' }}>压缩图预览：</p>
                  <img src={toolCompressedPreview} alt="压缩图预览" style={{ maxWidth: '100%', maxHeight: '200px' }} />
                </div>
              )}
              {toolLoading && (
                <div style={{ marginTop: '12px', textAlign: 'center', color: 'var(--accent)' }}>
                  处理中...
                </div>
              )}
            </div>
          ) : (
            <div className="dropzone-placeholder">
              <div className="dropzone-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
                  <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 9V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 9V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 15V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 15V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="dropzone-text">点击或拖拽上传照片</p>
              <p className="dropzone-hint">支持 JPG、PNG 格式</p>
            </div>
          )}
        </label>
      </div>
    </section>
  );
};

