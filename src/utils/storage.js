/**
 * 统一的存储管理工具
 * 提供类型安全、错误处理的 localStorage 操作接口
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/**
 * 检查是否在浏览器环境
 */
const checkBrowser = () => {
  if (!isBrowser) {
    console.warn('[Storage] 非浏览器环境，无法使用 localStorage');
    return false;
  }
  return true;
};

/**
 * 统一的存储管理工具
 */
export const Storage = {
  /**
   * 获取存储值
   * @param {string} key - 存储键名（建议使用 STORAGE_KEYS 常量）
   * @param {any} defaultValue - 默认值
   * @returns {any} 存储的值或默认值
   */
  get(key, defaultValue = null) {
    if (!checkBrowser()) return defaultValue;
    
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      
      // 尝试解析 JSON
      try {
        return JSON.parse(item);
      } catch {
        // 如果不是 JSON，返回原始字符串
        return item;
      }
    } catch (error) {
      console.error(`[Storage] 读取键 "${key}" 失败:`, error);
      return defaultValue;
    }
  },

  /**
   * 设置存储值
   * @param {string} key - 存储键名
   * @param {any} value - 要存储的值（会自动序列化为 JSON）
   * @returns {boolean} 是否成功
   */
  set(key, value) {
    if (!checkBrowser()) return false;
    
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
        return true;
      }
      
      // 自动序列化非字符串值
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.error(`[Storage] 写入键 "${key}" 失败:`, error);
      // 如果存储空间已满，尝试清理一些数据
      if (error.name === 'QuotaExceededError') {
        console.warn('[Storage] 存储空间已满，请清理一些数据');
      }
      return false;
    }
  },

  /**
   * 删除存储值
   * @param {string} key - 存储键名
   * @returns {boolean} 是否成功
   */
  remove(key) {
    if (!checkBrowser()) return false;
    
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`[Storage] 删除键 "${key}" 失败:`, error);
      return false;
    }
  },

  /**
   * 清空所有存储（谨慎使用）
   * @returns {boolean} 是否成功
   */
  clear() {
    if (!checkBrowser()) return false;
    
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('[Storage] 清空存储失败:', error);
      return false;
    }
  },

  /**
   * 检查键是否存在
   * @param {string} key - 存储键名
   * @returns {boolean} 是否存在
   */
  has(key) {
    if (!checkBrowser()) return false;
    
    try {
      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.error(`[Storage] 检查键 "${key}" 失败:`, error);
      return false;
    }
  },

  /**
   * 获取所有键名
   * @returns {string[]} 所有键名数组
   */
  keys() {
    if (!checkBrowser()) return [];
    
    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.error('[Storage] 获取所有键名失败:', error);
      return [];
    }
  },

  /**
   * 获取存储大小（字节）
   * @returns {number} 存储大小
   */
  size() {
    if (!checkBrowser()) return 0;
    
    try {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage[key].length + key.length;
        }
      }
      return total;
    } catch (error) {
      console.error('[Storage] 计算存储大小失败:', error);
      return 0;
    }
  },
};

/**
 * 存储键名常量（方便使用）
 */
export { STORAGE_KEYS };

/**
 * 便捷方法：获取字符串值（不解析 JSON）
 */
export const StorageString = {
  get(key, defaultValue = '') {
    if (!checkBrowser()) return defaultValue;
    
    try {
      return localStorage.getItem(key) || defaultValue;
    } catch (error) {
      console.error(`[StorageString] 读取键 "${key}" 失败:`, error);
      return defaultValue;
    }
  },

  set(key, value) {
    if (!checkBrowser()) return false;
    
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
        return true;
      }
      localStorage.setItem(key, String(value));
      return true;
    } catch (error) {
      console.error(`[StorageString] 写入键 "${key}" 失败:`, error);
      return false;
    }
  },
};

