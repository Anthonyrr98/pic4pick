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
    console.log('[addCameraOption] 被调用，输入值:', { value, trimmed, hasSupabase: !!supabase });
    
    if (!trimmed) {
      console.warn('[addCameraOption] 输入值为空，跳过');
      return;
    }
    
    setCameraOptions((prev) => {
      console.log('[addCameraOption] 当前相机选项:', prev);
      if (prev.includes(trimmed)) {
        console.log('[addCameraOption] 相机选项已存在于本地，但仍会尝试同步到数据库');
        // 即使本地已存在，也尝试同步到数据库（可能数据库中没有）
        if (supabase) {
          (async () => {
            try {
              const { error } = await supabase
                .from('gear_presets')
                .upsert(
                  { type: 'camera', name: trimmed },
                  { onConflict: 'type,name' }
                );
              if (error) {
                if (error.code === '23505' || String(error.code) === '409') {
                  console.log('[addCameraOption] 相机预设已存在于数据库:', trimmed);
                } else {
                  handleError(error, {
                    context: 'addCameraOption.supabase',
                    type: ErrorType.NETWORK,
                    silent: true,
                  });
                }
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
        return prev;
      }
      
      const next = [...prev, trimmed];
      Storage.set(STORAGE_KEYS.ADMIN_CAMERA_OPTIONS, next);
      console.log('[addCameraOption] 更新本地存储，新选项:', next);
      
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'camera', name: trimmed },
                { onConflict: 'type,name' }
              );
            if (error) {
              if (error.code === '23505' || String(error.code) === '409') {
                console.log('[addCameraOption] 相机预设已存在于数据库:', trimmed);
              } else {
                handleError(error, {
                  context: 'addCameraOption.supabase',
                  type: ErrorType.NETWORK,
                  silent: true,
                });
              }
            }
          } catch (e) {
            handleError(e, {
              context: 'addCameraOption',
              type: ErrorType.UNKNOWN,
              silent: true,
            });
          }
        })();
      } else {
        console.warn('[addCameraOption] Supabase 未配置，无法同步到数据库');
      }
      return next;
    });
  };

  /**
   * 添加镜头选项
   */
  const addLensOption = (value) => {
    const trimmed = (value || '').trim();
    console.log('[addLensOption] 被调用，输入值:', { value, trimmed, hasSupabase: !!supabase });
    
    if (!trimmed) {
      console.warn('[addLensOption] 输入值为空，跳过');
      return;
    }
    
    setLensOptions((prev) => {
      console.log('[addLensOption] 当前镜头选项:', prev);
      if (prev.includes(trimmed)) {
        console.log('[addLensOption] 镜头选项已存在于本地，但仍会尝试同步到数据库');
        // 即使本地已存在，也尝试同步到数据库（可能数据库中没有）
        if (supabase) {
          (async () => {
            try {
              const { error } = await supabase
                .from('gear_presets')
                .upsert(
                  { type: 'lens', name: trimmed },
                  { onConflict: 'type,name' }
                );
              if (error) {
                if (error.code === '23505' || String(error.code) === '409') {
                  console.log('[addLensOption] 镜头预设已存在于数据库:', trimmed);
                } else {
                  handleError(error, {
                    context: 'addLensOption.supabase',
                    type: ErrorType.NETWORK,
                    silent: true,
                  });
                }
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
        return prev;
      }
      
      const next = [...prev, trimmed];
      Storage.set(STORAGE_KEYS.ADMIN_LENS_OPTIONS, next);
      console.log('[addLensOption] 更新本地存储，新选项:', next);
      
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'lens', name: trimmed },
                { onConflict: 'type,name' }
              );
            if (error) {
              if (error.code === '23505' || String(error.code) === '409') {
                console.log('[addLensOption] 镜头预设已存在于数据库:', trimmed);
              } else {
                handleError(error, {
                  context: 'addLensOption.supabase',
                  type: ErrorType.NETWORK,
                  silent: true,
                });
              }
            }
          } catch (e) {
            handleError(e, {
              context: 'addLensOption',
              type: ErrorType.UNKNOWN,
              silent: true,
            });
          }
        })();
      } else {
        console.warn('[addLensOption] Supabase 未配置，无法同步到数据库');
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

