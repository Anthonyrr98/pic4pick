import Taro from '@tarojs/taro'
import { ApiError, apiUrl, parseResponse, publicReadUrl, publicReadHeaders } from './httpContract'
import { storage, STORAGE_KEYS } from './storage'
export { ApiError }
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
export interface Cancellation { cancelled: boolean; aborts: Array<() => void> }
export async function request<T>(url: string, method: Method = 'GET', data?: unknown, header: Record<string, string> = {}, cancellation?: Cancellation): Promise<T> {
  let abort: (() => void) | undefined
  try {
    if (cancellation?.cancelled) throw new ApiError('请求已取消')
    const task = Taro.request({ url, method, data: data as any, header: { 'Content-Type': 'application/json', ...header }, timeout: 30000 })
    abort = () => task.abort()
    cancellation?.aborts.push(abort)
    const response = await task
    if (cancellation?.cancelled) throw new ApiError('请求已取消')
    return parseResponse<T>(response.statusCode, response.data)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError((error as { errMsg?: string }).errMsg || '网络请求失败，请检查连接与服务器域名配置')
  } finally {
    if (cancellation && abort) cancellation.aborts = cancellation.aborts.filter(item => item !== abort)
  }
}
export async function api<T>(path: string, method: Method = 'GET', body?: unknown, admin = false, cancellation?: Cancellation): Promise<T> {
  const token = storage.get(STORAGE_KEYS.AUTH_TOKEN, '')
  if (admin && !token) throw new ApiError('请先登录管理后台', 401)
  try {
    return await request<T>(apiUrl(__PIC4PICK_CONFIG__.apiBaseUrl, path), method, body, admin ? { Authorization: `Bearer ${token}` } : {}, cancellation)
  } catch (error) {
    if (admin && error instanceof ApiError && [401, 403].includes(error.status)) storage.remove(STORAGE_KEYS.AUTH_TOKEN)
    throw error
  }
}
export async function readTable<T>(table: string, params: Record<string, string>, cancellation?: Cancellation) {
  const key = __PIC4PICK_CONFIG__.supabaseAnonKey
  if (!key) throw new ApiError('请配置 Supabase 公开读取 key')
  return request<T>(publicReadUrl(__PIC4PICK_CONFIG__.supabaseUrl, table, params), 'GET', undefined,
    publicReadHeaders(key), cancellation)
}
