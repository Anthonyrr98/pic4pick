// 确认对话框 Hook
import { useState, useCallback } from 'react';

/**
 * 使用确认对话框的 Hook
 * @returns {Object} { isOpen, message, title, confirmText, cancelText, confirmVariant, showConfirm, hideConfirm, handleConfirm }
 */
export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    message: '',
    title: '确认操作',
    confirmText: '确认',
    cancelText: '取消',
    confirmVariant: 'danger', // 'danger' | 'primary'
    onConfirm: null,
    onCancel: null,
  });

  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        message: options.message || '',
        title: options.title || '确认操作',
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        confirmVariant: options.confirmVariant || 'danger',
        onConfirm: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
          if (options.onConfirm) {
            options.onConfirm();
          }
        },
        onCancel: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
          if (options.onCancel) {
            options.onCancel();
          }
        },
      });
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    ...dialogState,
    showConfirm,
    hideConfirm,
  };
}

