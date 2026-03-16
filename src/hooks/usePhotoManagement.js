/**
 * 照片管理 Hook
 * 处理照片的增删改查、审核等操作
 */

import { useState, useCallback } from 'react';
import { Storage, STORAGE_KEYS } from '../utils/storage';
import { mapSupabaseRowToPhoto, buildSupabasePayloadFromPhoto, deleteOSSFile } from '../utils/adminUtils';
import { handleError, formatErrorMessage, ErrorType } from '../utils/errorHandler';
import { ensureHttps } from '../utils/urlUtils';

const STORAGE_KEY = STORAGE_KEYS.ADMIN_UPLOADS;
const APPROVED_STORAGE_KEY = STORAGE_KEYS.APPROVED_PHOTOS;
const REJECTED_STORAGE_KEY = STORAGE_KEYS.REJECTED_PHOTOS;

export const usePhotoManagement = (supabase, refreshSupabaseData, setSubmitMessage) => {
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
    if (!itemToApprove) return;

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
        const { reject_reason, ...updatePayload } = payload;
        const { error } = await supabase
          .from('photos')
          .upsert(
            {
              ...updatePayload,
              status: 'approved',
            },
            {
              onConflict: 'id', // 如果 id 已存在则更新
            },
          );
        
        if (error) {
          const message = (error.message || error.details || '').toLowerCase();
          const isTimeout =
            message.includes('statement timeout') ||
            message.includes('canceling statement due to statement timeout');

          if (isTimeout) {
            // 对于超时，前端保持乐观状态，仅提示用户稍后在 Supabase 控制台确认
            setSubmitMessage({
              type: 'error',
              text: '云端审核可能已成功，但查询超时，请稍后在 Supabase 控制台确认状态。',
            });
          } else {
            throw handleError(new Error(error.message || error.details || '更新失败'), {
              context: 'handleApprove.supabase',
              type: ErrorType.NETWORK,
            });
          }
        }
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

        return;
      }
    }
    
    setSubmitMessage({ type: 'success', text: '作品已通过审核，已添加到前端图库' });
  }, [adminUploads, supabase, refreshSupabaseData, setSubmitMessage]);

  /**
   * 审核拒绝
   */
  const handleReject = useCallback(async (id) => {
    const itemToReject = adminUploads.find((item) => item.id === id);
    if (!itemToReject) return;

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
        const { reject_reason, ...updatePayload } = payload;
        const { error, data } = await supabase
          .from('photos')
          .upsert({
            ...updatePayload,
            status: 'rejected',
            // reject_reason: rejectReason || null, // 暂时注释
          }, {
            onConflict: 'id' // 如果 id 已存在则更新
          })
          .select();
        
        if (error) {
          const errorMessage = error.message || error.details || '更新失败';
          const errorDetails = error.hint ? ` (${error.hint})` : '';
          throw handleError(new Error(`${errorMessage}${errorDetails}`), {
            context: 'handleReject.supabase',
            type: ErrorType.NETWORK,
          });
        }
        
        // 验证操作是否成功（upsert 应该总是返回数据）
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
      }
    }
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

    if (!itemToDelete) return;

    try {
      // 删除 OSS 文件
      if (itemToDelete.image) {
        await deleteOSSFile(itemToDelete.image);
      }
      if (itemToDelete.thumbnail) {
        await deleteOSSFile(itemToDelete.thumbnail);
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

      // 从 Supabase 删除
      if (supabase) {
        const { error } = await supabase
          .from('photos')
          .delete()
          .eq('id', id);
        
        if (error) {
          throw handleError(error, {
            context: 'handleDelete.supabase',
            type: ErrorType.NETWORK,
          });
        }
        await refreshSupabaseData();
      }

      setSubmitMessage({ type: 'success', text: '删除成功！' });
    } catch (error) {
      handleError(error, {
        context: 'handleDelete',
        type: ErrorType.NETWORK,
      });
      setSubmitMessage({ type: 'error', text: '删除失败，请重试' });
    }
  }, [adminUploads, approvedPhotos, rejectedPhotos, supabase, refreshSupabaseData, setSubmitMessage]);

  /**
   * 重新提交审核
   */
  const handleResubmit = useCallback(async (id) => {
    const itemToResubmit = rejectedPhotos.find((item) => item.id === id);
    if (!itemToResubmit) return;

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
        // 更新状态为 pending，不包含 reject_reason（如果数据库没有该字段）
        await supabase
          .from('photos')
          .update({ status: 'pending' })
          .eq('id', id);
        await refreshSupabaseData();
      } catch (error) {
        handleError(error, {
          context: 'handleResubmit',
          type: ErrorType.NETWORK,
        });
        setSubmitMessage({ type: 'error', text: `重新提交失败：${formatErrorMessage(error)}` });
        return;
      }
    }

    setSubmitMessage({ type: 'success', text: '作品已重新提交审核' });
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

