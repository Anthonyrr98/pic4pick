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
              // 尝试使用索引名称作为 onConflict
              const { error, data } = await supabase
                .from('gear_presets')
                .upsert(
                  { type: 'camera', name: trimmed },
                  { onConflict: 'gear_presets_type_name_idx' }
                );
              
              console.log('[addCameraOption] Supabase 响应（已存在情况）:', { error, data });
              
              if (error) {
                // 如果使用索引名称失败，尝试不使用 onConflict（让 Supabase 自动检测）
                console.log('[addCameraOption] 使用索引名称失败，尝试不使用 onConflict');
                const { error: error2, data: data2 } = await supabase
                  .from('gear_presets')
                  .upsert({ type: 'camera', name: trimmed });
                
                console.log('[addCameraOption] Supabase 响应（无 onConflict）:', { error: error2, data: data2 });
                
                if (error2) {
                  if (error2.code !== '23505') {
                    console.error('[addCameraOption] Supabase 错误:', error2);
                    handleError(error2, {
                      context: 'addCameraOption.supabase',
                      type: ErrorType.NETWORK,
                      silent: true,
                    });
                  } else {
                    console.log('[addCameraOption] 相机预设已存在于数据库:', trimmed);
                  }
                } else {
                  console.log('[addCameraOption] ✅ 成功同步相机预设到 gear_presets:', trimmed);
                }
              } else {
                console.log('[addCameraOption] ✅ 成功同步相机预设到 gear_presets:', trimmed);
              }
            } catch (e) {
              console.error('[addCameraOption] 异常:', e);
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
            console.log('[addCameraOption] 开始同步到 Supabase gear_presets:', { type: 'camera', name: trimmed });
            // 尝试使用索引名称作为 onConflict
            let { error, data } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'camera', name: trimmed },
                { onConflict: 'gear_presets_type_name_idx' }
              );
            
            console.log('[addCameraOption] Supabase 响应（使用索引名称）:', { error, data });
            
            // 如果使用索引名称失败，尝试不使用 onConflict（让 Supabase 自动检测唯一约束）
            if (error) {
              console.log('[addCameraOption] 使用索引名称失败，尝试不使用 onConflict');
              const result = await supabase
                .from('gear_presets')
                .upsert({ type: 'camera', name: trimmed });
              error = result.error;
              data = result.data;
              console.log('[addCameraOption] Supabase 响应（无 onConflict）:', { error, data });
            }
            
            if (error) {
              // 23505 是唯一约束冲突错误码，这是正常的（记录已存在）
              if (error.code !== '23505') {
                console.error('[addCameraOption] Supabase 错误:', error);
                handleError(error, {
                  context: 'addCameraOption.supabase',
                  type: ErrorType.NETWORK,
                  silent: true,
                });
              } else {
                console.log('[addCameraOption] 相机预设已存在于数据库:', trimmed);
              }
            } else {
              console.log('[addCameraOption] ✅ 成功添加相机预设到 gear_presets:', trimmed);
            }
          } catch (e) {
            console.error('[addCameraOption] 异常:', e);
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
              // 尝试使用索引名称作为 onConflict
              let { error, data } = await supabase
                .from('gear_presets')
                .upsert(
                  { type: 'lens', name: trimmed },
                  { onConflict: 'gear_presets_type_name_idx' }
                );
              
              console.log('[addLensOption] Supabase 响应（使用索引名称）:', { error, data });
              
              // 如果使用索引名称失败，尝试不使用 onConflict（让 Supabase 自动检测唯一约束）
              if (error) {
                console.log('[addLensOption] 使用索引名称失败，尝试不使用 onConflict');
                const result = await supabase
                  .from('gear_presets')
                  .upsert({ type: 'lens', name: trimmed });
                error = result.error;
                data = result.data;
                console.log('[addLensOption] Supabase 响应（无 onConflict）:', { error, data });
              }
              
              if (error) {
                if (error.code !== '23505') {
                  console.error('[addLensOption] Supabase 错误:', error);
                  handleError(error, {
                    context: 'addLensOption.supabase',
                    type: ErrorType.NETWORK,
                    silent: true,
                  });
                } else {
                  console.log('[addLensOption] 镜头预设已存在于数据库:', trimmed);
                }
              } else {
                console.log('[addLensOption] ✅ 成功同步镜头预设到 gear_presets:', trimmed);
              }
            } catch (e) {
              console.error('[addLensOption] 异常:', e);
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
            console.log('[addLensOption] 开始同步到 Supabase gear_presets:', { type: 'lens', name: trimmed });
            // 尝试使用索引名称作为 onConflict
            let { error, data } = await supabase
              .from('gear_presets')
              .upsert(
                { type: 'lens', name: trimmed },
                { onConflict: 'gear_presets_type_name_idx' }
              );
            
            console.log('[addLensOption] Supabase 响应（使用索引名称）:', { error, data });
            
            // 如果使用索引名称失败，尝试不使用 onConflict（让 Supabase 自动检测唯一约束）
            if (error) {
              console.log('[addLensOption] 使用索引名称失败，尝试不使用 onConflict');
              const result = await supabase
                .from('gear_presets')
                .upsert({ type: 'lens', name: trimmed });
              error = result.error;
              data = result.data;
              console.log('[addLensOption] Supabase 响应（无 onConflict）:', { error, data });
            }
            
            if (error) {
              // 23505 是唯一约束冲突错误码，这是正常的（记录已存在）
              if (error.code !== '23505') {
                console.error('[addLensOption] Supabase 错误:', error);
                handleError(error, {
                  context: 'addLensOption.supabase',
                  type: ErrorType.NETWORK,
                  silent: true,
                });
              } else {
                console.log('[addLensOption] 镜头预设已存在于数据库:', trimmed);
              }
            } else {
              console.log('[addLensOption] ✅ 成功添加镜头预设到 gear_presets:', trimmed);
            }
          } catch (e) {
            console.error('[addLensOption] 异常:', e);
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

