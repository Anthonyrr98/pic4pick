/**
 * 相机/镜头选项管理 Hook
 */

import { useState, useEffect } from 'react';
import { Storage, STORAGE_KEYS } from '../utils/storage';
import { handleError, ErrorType } from '../utils/errorHandler';

export const useGearOptions = (supabase) => {
  const [cameraOptions, setCameraOptions] = useState(() => {
    return Storage.get(STORAGE_KEYS.ADMIN_CAMERA_OPTIONS, []);
  });

  const [lensOptions, setLensOptions] = useState(() => {
    return Storage.get(STORAGE_KEYS.ADMIN_LENS_OPTIONS, []);
  });

  const [showCameraDropdown, setShowCameraDropdown] = useState(false);
  const [showLensDropdown, setShowLensDropdown] = useState(false);

  /**
   * 添加相机选项
   */
  const addCameraOption = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    setCameraOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      Storage.set(STORAGE_KEYS.ADMIN_CAMERA_OPTIONS, next);
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'camera', name: trimmed },
                { onConflict: 'type,name', ignoreDuplicates: true }
              );
            if (error && error.code !== '23505') {
              handleError(error, {
                context: 'addCameraOption.supabase',
                type: ErrorType.NETWORK,
                silent: true,
              });
            }
          } catch (e) {
            handleError(e, {
              context: 'addCameraOption',
              type: ErrorType.UNKNOWN,
              silent: true,
            });
          }
        })();
      }
      return next;
    });
  };

  /**
   * 添加镜头选项
   */
  const addLensOption = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    setLensOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      Storage.set(STORAGE_KEYS.ADMIN_LENS_OPTIONS, next);
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'lens', name: trimmed },
                { onConflict: 'type,name', ignoreDuplicates: true }
              );
            if (error && error.code !== '23505') {
              handleError(error, {
                context: 'addLensOption.supabase',
                type: ErrorType.NETWORK,
                silent: true,
              });
            }
          } catch (e) {
            handleError(e, {
              context: 'addLensOption',
              type: ErrorType.UNKNOWN,
              silent: true,
            });
          }
        })();
      }
      return next;
    });
  };

  /**
   * 从 Supabase 加载常用相机/镜头
   */
  useEffect(() => {
    const loadGearPresets = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('gear_presets')
          .select('type, name')
          .order('name', { ascending: true });
        if (error) {
          handleError(error, {
            context: 'loadGearPresets.supabase',
            type: ErrorType.NETWORK,
            silent: true,
          });
          return;
        }
        const cameras = [];
        const lenses = [];
        for (const row of data || []) {
          if (row.type === 'camera' && row.name && !cameras.includes(row.name)) {
            cameras.push(row.name);
          }
          if (row.type === 'lens' && row.name && !lenses.includes(row.name)) {
            lenses.push(row.name);
          }
        }
        if (cameras.length) {
          setCameraOptions((prev) => {
            const merged = Array.from(new Set([...prev, ...cameras]));
            Storage.set(STORAGE_KEYS.ADMIN_CAMERA_OPTIONS, merged);
            return merged;
          });
        }
        if (lenses.length) {
          setLensOptions((prev) => {
            const merged = Array.from(new Set([...prev, ...lenses]));
            Storage.set(STORAGE_KEYS.ADMIN_LENS_OPTIONS, merged);
            return merged;
          });
        }
      } catch (e) {
        handleError(e, {
          context: 'loadGearPresets',
          type: ErrorType.NETWORK,
          silent: true,
        });
      }
    };
    loadGearPresets();
  }, [supabase]);

  return {
    cameraOptions,
    setCameraOptions,
    lensOptions,
    setLensOptions,
    showCameraDropdown,
    setShowCameraDropdown,
    showLensDropdown,
    setShowLensDropdown,
    addCameraOption,
    addLensOption,
  };
};

