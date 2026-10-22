export function fitTexture(width: number, height: number, deviceLimit: number) {
  if (![width, height, deviceLimit].every(value => Number.isFinite(value) && value > 0)) throw new Error('空间图片尺寸异常')
  const limit = Math.floor(Math.min(2048, deviceLimit))
  if (limit < 1) throw new Error('空间图片尺寸异常')
  const scale = Math.min(1, limit / Math.max(width, height))
  return { width: Math.max(1, Math.min(limit, Math.round(width * scale))), height: Math.max(1, Math.min(limit, Math.round(height * scale))) }
}
export async function retryExpiredDepth<T>(load: () => Promise<T>, cancelled: () => boolean): Promise<T> {
  try { return await load() }
  catch (failure) {
    const status = (failure as { status?: number }).status
    if (cancelled() || ![401, 403].includes(status || 0)) throw failure
    return load() // A second attempt obtains a fresh signature; no retry loop.
  }
}
