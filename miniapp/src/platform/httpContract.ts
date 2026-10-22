export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message) }
}
export function parseResponse<T>(status: number, body: unknown): T {
  let data = body
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { throw new ApiError(`接口返回非 JSON 数据 (${status})`, status) }
  }
  const payload = data as { success?: boolean; error?: string; message?: string } | null
  if (status < 200 || status >= 300 || payload?.success === false) {
    throw new ApiError(payload?.error || payload?.message || `请求失败 (${status})`, status)
  }
  if (!data || typeof data !== 'object') throw new ApiError('服务器未返回有效数据', status)
  return data as T
}
export function apiUrl(base: string, path: string) {
  if (!/^https:\/\//.test(base)) throw new ApiError('请配置有效的 HTTPS 后台地址')
  return base.replace(/\/+$/, '').replace(/\/api$/, '') + path
}
export function publicReadUrl(base: string, table: string, params: Record<string, string>) {
  if (!/^https:\/\//.test(base)) throw new ApiError('请配置有效的 Supabase HTTPS 公开读地址')
  return `${base.replace(/\/+$/, '')}/rest/v1/${table}?` + Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
}
export function publicReadHeaders(key: string): Record<string, string> {
  if (!key) throw new ApiError('请配置 Supabase 公开读取 key')
  return { apikey: key, 'Accept-Profile': 'public', ...(!key.startsWith('sb_publishable_') ? { Authorization: `Bearer ${key}` } : {}) }
}
