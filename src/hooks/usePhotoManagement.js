/**
 * 照片管理 Hook
 * 处理照片的增删改查、审核等操作
 */

import { useState, useCallback, useRef } from 'react';
import { Storage, STORAGE_KEYS } from '../utils/storage';
import { buildSupabasePayloadFromPhoto, deleteOSSFile } from '../utils/adminUtils';
import { handleError, formatErrorMessage, ErrorType } from '../utils/errorHandler';
import { ensureHttps } from '../utils/urlUtils';
import { deleteAdminPhoto, updateAdminPhoto, upsertAdminPhoto } from '../utils/adminApi';

const STORAGE_KEY = STORAGE_KEYS.ADMIN_UPLOADS;
const APPROVED_STORAGE_KEY = STORAGE_KEYS.APPROVED_PHOTOS;
const REJECTED_STORAGE_KEY = STORAGE_KEYS.REJECTED_PHOTOS;

export const usePhotoManagement = (supabase, refreshSupabaseData, setSubmitMessage) => {
  const resubmittingIds = useRef(new Set());
  const [adminUploads, setAdminUploads] = useState(() => {
    const photos = Storage.get(STORAGE_KEY, []);
    // 确保所有 URL 都使用 HTTPS
    return photos.map(photo => ({
      ...photo,
      image: ensureHttps(photo.image || ''),
      thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
      preview: ensureHttps(photo.preview || photo.thumbnail || ''),
    }));
  });

  const [approvedPhotos, setApprovedPhotos] = useState(() => {
    const photos = Storage.get(APPROVED_STORAGE_KEY, []);
    // 确保所有 URL 都使用 HTTPS
    return photos.map(photo => ({
      ...photo,
      image: ensureHttps(photo.image || ''),
      thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
      preview: ensureHttps(photo.preview || photo.thumbnail || ''),
    }));
  });

  const [rejectedPhotos, setRejectedPhotos] = useState(() => {
    const photos = Storage.get(REJECTED_STORAGE_KEY, []);
    // 确保所有 URL 都使用 HTTPS
    return photos.map(photo => ({
      ...photo,
      image: ensureHttps(photo.image || ''),
      thumbnail: ensureHttps(photo.thumbnail || photo.preview || ''),
      preview: ensureHttps(photo.preview || photo.thumbnail || ''),
    }));
  });

  /**
   * 审核通过
   */
  const handleApprove = useCallback(async (id) => {
    const itemToApprove = adminUploads.find((item) => item.id === id);
    if (!itemToApprove) return false;

    const approvedItem = { ...itemToApprove, status: 'approved' };

    // 先乐观更新：立即从待审核列表移除，避免“点了没消失”的体验
    setAdminUploads((prev) => prev.filter((item) => item.id !== id));
    
    // 添加到已审核列表
    setApprovedPhotos((prev) => {
      const updated = [approvedItem, ...prev];
      if (!supabase) {
        try {
          Storage.set(APPROVED_STORAGE_KEY, updated);
        } catch (error) {
          handleError(error, {
            context: 'handleApprove.storage',
            type: ErrorType.STORAGE,
            silent: true,
          });
        }
      }
      return updated;
    });

    if (supabase) {
      try {
        const payload = buildSupabasePayloadFromPhoto(approvedItem, 'approved');
        
        // 使用 upsert 而不是 update，这样如果记录不存在会创建，存在则更新
        // 移除 reject_reason 字段（如果数据库中没有该字段）
        const updatePayload = { ...payload };
        delete updatePayload.reject_reason;
        await upsertAdminPhoto({
          ...updatePayload,
          status: 'approved',
        });
      } catch (error) {
        console.error('审核失败详情:', error);

        const appError = handleError(error, {
          context: 'handleApprove',
          type: ErrorType.NETWORK,
        });

        // 显示更详细的错误信息
        let errorText = formatErrorMessage(appError);
        if (error.originalError) {
          const originalMessage = error.originalError.message || '';
          if (originalMessage && originalMessage !== errorText) {
            errorText = `${errorText}: ${originalMessage}`;
          }
        }

        setSubmitMessage({ type: 'error', text: `云端审核失败：${errorText}` });

        // 回滚本地状态更改
        setApprovedPhotos((prev) => prev.filter((item) => item.id !== id));
        setAdminUploads((prev) => [itemToApprove, ...prev]);

        return false;
      }
    }
    
    setSubmitMessage({ type: 'success', text: '作品已通过审核，已添加到前端图库' });
    return true;
  }, [adminUploads, supabase, setSubmitMessage]);

  /**
   * 审核拒绝
   */
  const handleReject = useCallback(async (id) => {
    const itemToReject = adminUploads.find((item) => item.id === id);
    if (!itemToReject) return false;

    // 从待审核列表移除
    setAdminUploads((prev) => prev.filter((item) => item.id !== id));

    // 添加到已拒绝列表
    const rejectedItem = { ...itemToReject, status: 'rejected' };
    setRejectedPhotos((prev) => {
      const updated = [rejectedItem, ...prev];
      if (!supabase) {
        try {
          Storage.set(REJECTED_STORAGE_KEY, updated);
        } catch (error) {
          handleError(error, {
            context: 'handleReject.storage',
            type: ErrorType.STORAGE,
            silent: true,
          });
        }
      }
      return updated;
    });

    if (supabase) {
      try {
        const payload = buildSupabasePayloadFromPhoto(rejectedItem, 'rejected');
        
        // 使用 upsert 而不是 update，这样如果记录不存在会创建，存在则更新
        // 移除 reject_reason 字段（如果数据库中没有该字段）
        const updatePayload = { ...payload };
        delete updatePayload.reject_reason;
        const data = await upsertAdminPhoto({
          ...updatePayload,
          status: 'rejected',
          // reject_reason: rejectReason || null, // 暂时注释
        });

        if (!data || data.length === 0) {
          console.warn('拒绝操作完成，但 Supabase 未返回数据。这可能是因为记录已存在且未更改。');
          // 不抛出错误，继续执行（可能是记录已存在且状态相同）
        }
        
        await refreshSupabaseData();
      } catch (error) {
        console.error('拒绝失败详情:', error);
        
        const appError = handleError(error, {
          context: 'handleReject',
          type: ErrorType.NETWORK,
        });
        
        let errorText = formatErrorMessage(appError);
        if (error.originalError) {
          const originalMessage = error.originalError.message || '';
          if (originalMessage && originalMessage !== errorText) {
            errorText = `${errorText}: ${originalMessage}`;
          }
        }
        
        setSubmitMessage({ type: 'error', text: `拒绝作品失败：${errorText}` });
        
        // 回滚本地状态更改
        setRejectedPhotos((prev) => prev.filter((item) => item.id !== id));
        setAdminUploads((prev) => [...prev, itemToReject]);
        return false;
      }
    }

    return true;
  }, [adminUploads, supabase, refreshSupabaseData, setSubmitMessage]);

  /**
   * 删除照片
   */
  const handleDelete = useCallback(async (id, source = 'pending') => {
    let itemToDelete = null;
    
    if (source === 'pending') {
      itemToDelete = adminUploads.find((item) => item.id === id);
    } else if (source === 'approved') {
      itemToDelete = approvedPhotos.find((item) => item.id === id);
    } else if (source === 'rejected') {
      itemToDelete = rejectedPhotos.find((item) => item.id === id);
    }

    if (!itemToDelete) return false;

    try {
      let cleanupPending = false;
      if (supabase) {
        // The server persists cleanup intent and removes the record before OSS.
        const result = await deleteAdminPhoto(id);
        cleanupPending = result.cleanupPending;
      } else {
        // Persist the record removal first; retain it if local storage is full/unavailable.
        const entries = source === 'approved' ? approvedPhotos : source === 'rejected' ? rejectedPhotos : adminUploads;
        const key = source === 'approved' ? APPROVED_STORAGE_KEY : source === 'rejected' ? REJECTED_STORAGE_KEY : STORAGE_KEY;
        const storedEntries = Storage.get(key, entries);
        if (!Storage.set(key, storedEntries.filter((item) => item.id !== id))) {
          throw new Error('无法保存本地删除结果');
        }
        const urls = [...new Set([itemToDelete.image, itemToDelete.thumbnail].filter(Boolean))];
        const results = await Promise.allSettled(urls.map(deleteOSSFile));
        cleanupPending = results.some((result) => result.status === 'rejected');
      }

      // 从对应列表移除
      if (source === 'pending') {
        setAdminUploads((prev) => {
          const updated = prev.filter((item) => item.id !== id);
          if (!supabase) {
            try {
              Storage.set(STORAGE_KEY, updated);
            } catch (error) {
              handleError(error, {
                context: 'handleDelete.localStorage',
                type: ErrorType.STORAGE,
                silent: true,
              });
            }
          }
          return updated;
        });
      } else if (source === 'approved') {
        setApprovedPhotos((prev) => {
          const updated = prev.filter((item) => item.id !== id);
          if (!supabase) {
            try {
              Storage.set(APPROVED_STORAGE_KEY, updated);
            } catch (error) {
              handleError(error, {
                context: 'handleDelete.localStorage',
                type: ErrorType.STORAGE,
                silent: true,
              });
            }
          }
          return updated;
        });
      } else if (source === 'rejected') {
        setRejectedPhotos((prev) => {
          const updated = prev.filter((item) => item.id !== id);
          if (!supabase) {
            try {
              Storage.set(REJECTED_STORAGE_KEY, updated);
            } catch (error) {
              handleError(error, {
                context: 'handleDelete.localStorage',
                type: ErrorType.STORAGE,
                silent: true,
              });
            }
          }
          return updated;
        });
      }

      if (supabase) {
        await refreshSupabaseData();
      }

      setSubmitMessage({
        type: cleanupPending ? 'info' : 'success',
        text: cleanupPending
          ? (supabase ? '作品已删除，云端图片清理暂未完成，后台会自动重试。' : '作品已从本地删除，但云端图片清理失败。')
          : '作品已删除，图片清理完成。',
      });
      return { deleted: true, cleanupPending };
    } catch (error) {
      handleError(error, {
        context: 'handleDelete',
        type: ErrorType.NETWORK,
      });
      setSubmitMessage({ type: 'error', text: '删除失败，请重试' });
      return false;
    }
  }, [adminUploads, approvedPhotos, rejectedPhotos, supabase, refreshSupabaseData, setSubmitMessage]);

  /**
   * 重新提交审核
   */
  const handleResubmit = useCallback(async (id) => {
    const itemToResubmit = rejectedPhotos.find((item) => item.id === id);
    if (!itemToResubmit || resubmittingIds.current.has(id)) return false;
    resubmittingIds.current.add(id);

    // 从已拒绝列表移除
    setRejectedPhotos((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      if (!supabase) {
        try {
          Storage.set(REJECTED_STORAGE_KEY, updated);
        } catch (error) {
          handleError(error, {
            context: 'handleResubmit.updateList',
            type: ErrorType.STORAGE,
            silent: true,
          });
        }
      }
      return updated;
    });

    // 添加到待审核列表
    const pendingItem = { ...itemToResubmit, status: 'pending', reject_reason: null };
    setAdminUploads((prev) => [pendingItem, ...prev]);

    if (supabase) {
      try {
        // Keep a failed write separate from a failed refresh of a committed write.
        await updateAdminPhoto(id, { status: 'pending' });
      } catch (error) {
        setAdminUploads((prev) => prev.filter((item) => item.id !== id));
        setRejectedPhotos((prev) => {
          if (prev.some((item) => item.id === id)) return prev;
          const restored = [...prev];
          restored.splice(Math.min(rejectedPhotos.findIndex((item) => item.id === id), restored.length), 0, itemToResubmit);
          return restored;
        });
        handleError(error, {
          context: 'handleResubmit',
          type: ErrorType.NETWORK,
        });
        setSubmitMessage({ type: 'error', text: `重新提交失败：${formatErrorMessage(error)}` });
        resubmittingIds.current.delete(id);
        return false;
      }
      try {
        await refreshSupabaseData();
      } catch (error) {
        handleError(error, { context: 'handleResubmit.refresh', type: ErrorType.NETWORK });
        setSubmitMessage({ type: 'info', text: '作品已重新提交，但列表刷新失败，请刷新页面。' });
        resubmittingIds.current.delete(id);
        return true;
      }
    }

    setSubmitMessage({ type: 'success', text: '作品已重新提交审核' });
    resubmittingIds.current.delete(id);
    return true;
  }, [rejectedPhotos, supabase, refreshSupabaseData, setSubmitMessage]);

  return {
    adminUploads,
    setAdminUploads,
    approvedPhotos,
    setApprovedPhotos,
    rejectedPhotos,
    setRejectedPhotos,
    handleApprove,
    handleReject,
    handleDelete,
    handleResubmit,
  };
};

