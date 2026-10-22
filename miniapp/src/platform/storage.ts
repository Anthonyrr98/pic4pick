import Taro from '@tarojs/taro'
export { STORAGE_KEYS } from '../../../packages/shared/storageKeys'
export const storage = {
  get<T>(key: string, fallback: T): T {
    try { const value = Taro.getStorageSync(key); return value === '' || value === undefined ? fallback : value } catch { return fallback }
  },
  set(key: string, value: unknown) { Taro.setStorageSync(key, value) },
  remove(key: string) { Taro.removeStorageSync(key) },
}
