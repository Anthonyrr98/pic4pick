import { useState, useEffect, useRef } from 'react';
import './UploadProgress.css';

export function UploadProgress({ progress, fileName, isVisible, uploadedBytes, totalBytes }) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const animationFrameRef = useRef(null);

  // 平滑更新进度显示，避免跳跃
  useEffect(() => {
    if (progress === null) {
      setDisplayProgress(0);
      return;
    }

    const targetProgress = Math.min(100, Math.max(0, progress));
    
    // 使用 requestAnimationFrame 实现平滑过渡
    const updateProgress = () => {
      setDisplayProgress((prev) => {
        const diff = targetProgress - prev;
        // 如果差异很小，直接设置目标值
        if (Math.abs(diff) < 0.1) {
          return targetProgress;
        }
        // 否则平滑过渡（使用缓动函数）
        const next = prev + diff * 0.2;
        
        // 继续动画直到达到目标值
        if (Math.abs(targetProgress - next) > 0.1) {
          animationFrameRef.current = requestAnimationFrame(updateProgress);
        }
        
        return next;
      });
    };

    // 取消之前的动画
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(updateProgress);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [progress]);

  if (!isVisible || progress === null) {
    return null;
  }

  const percentage = Math.min(100, Math.max(0, displayProgress));
  const formattedBytes = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="upload-progress-container">
      <div className="upload-progress-header">
        <span className="upload-progress-label">上传中...</span>
        <span className="upload-progress-percentage">{Math.round(percentage)}%</span>
      </div>
      {fileName && (
        <div className="upload-progress-filename">{fileName}</div>
      )}
      {uploadedBytes && totalBytes && (
        <div className="upload-progress-bytes">
          {formattedBytes(uploadedBytes)} / {formattedBytes(totalBytes)}
        </div>
      )}
      <div className="upload-progress-bar">
        <div 
          className="upload-progress-fill" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

