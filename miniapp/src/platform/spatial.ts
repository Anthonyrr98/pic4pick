import Taro from '@tarojs/taro'
import { VERTEX, FRAGMENT, clampSpatialInput } from '../../../packages/shared/spatialCore'
import { createPrecomputedSpatialDepthClient } from '../../../packages/shared/precomputedSpatialDepth'
import { resizeSpatialPixels } from '../../../packages/shared/spatialPixels'
import { fitTexture, retryExpiredDepth } from '../../../packages/shared/spatialAssets'
import { ApiError, api, readTable, request } from './request'
import { preview } from './media'
import type { GalleryPhoto } from '../../../packages/shared/photoDataUtils'

interface AbortListener { (): void }
export interface SpatialSession {
  cancelled: boolean
  aborts: Array<() => void>
  signal: { readonly aborted: boolean; addEventListener(type: string, listener: AbortListener, options?: unknown): void; removeEventListener(type: string, listener: AbortListener): void }
  cancel(): void
}
export function spatialCancelled() { const error = new Error('空间效果已取消'); error.name = 'AbortError'; return error }
export function createSpatialSession(): SpatialSession {
  const listeners = new Set<AbortListener>()
  const session: SpatialSession = { cancelled: false, aborts: [],
    signal: { get aborted() { return session.cancelled }, addEventListener(_type, listener) { listeners.add(listener) }, removeEventListener(_type, listener) { listeners.delete(listener) } },
    cancel() {
      if (this.cancelled) return
      this.cancelled = true
      for (const abort of this.aborts.splice(0)) abort()
      for (const listener of [...listeners]) listener()
      listeners.clear()
    } }
  return session
}
function ensureActive(session: SpatialSession) { if (session.cancelled) throw spatialCancelled() }
async function download(url: string, session: SpatialSession) {
  ensureActive(session)
  const task = Taro.downloadFile({ url, timeout: 30000 })
  const abort = () => task.abort(); session.aborts.push(abort)
  try {
    const result = await task
    if (result.statusCode !== 200 || session.cancelled) {
      removeTemporary(result.tempFilePath)
      ensureActive(session)
      throw new ApiError(`空间图片下载失败 (${result.statusCode})`, result.statusCode)
    }
    return result.tempFilePath
  } finally { session.aborts = session.aborts.filter(item => item !== abort) }
}
function removeTemporary(path: string) { if (path) Taro.getFileSystemManager().unlink({ filePath: path, fail: () => {} }) }
function canvasImage(canvas: any, path: string, session: SpatialSession): Promise<any> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage()
    let done = false
    const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; session.aborts = session.aborts.filter(item => item !== abort) }
    const fail = (error: Error) => { if (done) return; done = true; cleanup(); try { image.src = '' } catch { /* Native image may reject an empty source. */ } reject(error) }
    const abort = () => fail(spatialCancelled())
    const timer = setTimeout(() => fail(new Error('空间图片解码超时，请重试')), 20000)
    image.onload = () => { if (done) return; if (session.cancelled) { abort(); return }; done = true; cleanup(); resolve(image) }
    image.onerror = () => fail(new Error('空间图片解码失败'))
    session.aborts.push(abort)
    if (session.cancelled) { abort(); return }
    image.src = path
  })
}
interface PixelImage { width: number; height: number; values: Uint8Array }
async function pixelsFromPath(path: string, session: SpatialSession, limit: number, expected?: { width: number; height: number }): Promise<PixelImage> {
  // Each image is created by its own 2D canvas. WebGL/2D image nodes cannot be mixed in wx.
  const canvas = Taro.createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
  let image: any
  try {
    ensureActive(session)
    image = await canvasImage(canvas, path, session)
    ensureActive(session)
    if (expected && (image.width !== expected.width || image.height !== expected.height)) throw new Error('空间深度图尺寸不匹配')
    const size = fitTexture(image.width, image.height, limit)
    canvas.width = size.width; canvas.height = size.height
    const context = canvas.getContext('2d') as CanvasRenderingContext2D
    if (!context) throw new Error('当前设备无法读取空间图片')
    context.drawImage(image, 0, 0, size.width, size.height)
    const rgba = context.getImageData(0, 0, size.width, size.height).data
    ensureActive(session)
    if (expected) {
      const values = new Uint8Array(size.width * size.height)
      for (let index = 0; index < values.length; index++) values[index] = rgba[index * 4]
      return { ...size, values }
    }
    return { ...size, values: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength) }
  } finally {
    if (image) { try { image.src = '' } catch { /* Release the native decoded image where supported. */ } }
    canvas.width = 1; canvas.height = 1
  }
}
async function signedDepth(row: any, session: SpatialSession): Promise<string> {
  if (row.storage_backend === 'oss') {
    const result = await api<{ signedUrl: string; generation: string }>(`/api/photos/${encodeURIComponent(row.photo_id)}/spatial-depth`, 'GET', undefined, false, session)
    if (result.generation !== row.generation) throw new Error('照片已更新，请重新打开空间效果')
    return result.signedUrl
  }
  const base = __PIC4PICK_CONFIG__.supabaseUrl.replace(/\/+$/, ''), key = __PIC4PICK_CONFIG__.supabaseAnonKey
  const result = await request<{ signedURL: string }>(`${base}/storage/v1/object/sign/spatial-depth/${row.depth_path.split('/').map(encodeURIComponent).join('/')}`, 'POST', { expiresIn: 300 },
    { apikey: key, ...(!key.startsWith('sb_publishable_') ? { Authorization: `Bearer ${key}` } : {}) }, session)
  return /^https:\/\//.test(result.signedURL) ? result.signedURL : `${base}/storage/v1${result.signedURL}`
}
// Cache decoded grayscale bytes, never expiring signed URLs, images or temporary file paths.
const depthClient = createPrecomputedSpatialDepthClient({
  createCancelled: spatialCancelled,
  async loadMetadata(photoId: string, signal: SpatialSession['signal']) {
    const session = signalSessions.get(signal)!
    const rows = await readTable<any[]>('photo_spatial', { select: 'photo_id,generation,status,storage_backend,depth_path,width,height', photo_id: `eq.${photoId}`, limit: '1' }, session)
    return rows[0] || null
  },
  async loadDepth(row: any, signal: SpatialSession['signal']) {
    const session = signalSessions.get(signal)!
    return retryExpiredDepth(async () => {
      const path = await download(await signedDepth(row, session), session)
      try { return await pixelsFromPath(path, session, 1024, row) } finally { removeTemporary(path) }
    }, () => session.cancelled)
  },
})
const signalSessions = new WeakMap<SpatialSession['signal'], SpatialSession>()
if (Taro.canIUse('onMemoryWarning')) Taro.onMemoryWarning(() => depthClient.clearCache())
async function depthFor(photoId: string, session: SpatialSession, onStatus: (status: string) => void, prefetch = false) {
  signalSessions.set(session.signal, session)
  return prefetch ? depthClient.prefetch(photoId, session.signal) : depthClient.request(photoId, (progress: { stage: string }) => onStatus(progress.stage === 'pending' ? '空间照片正在后台准备…' : '正在读取空间照片…'), session.signal)
}
export async function prefetchSpatialDepth(photoId: string, session: SpatialSession) { return depthFor(photoId, session, () => {}, true) }
export async function loadSpatialImages(canvas: any, photo: GalleryPhoto, session: SpatialSession, onStatus: (status: string) => void) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false }) as WebGLRenderingContext
  if (!gl) throw new Error('当前设备暂不支持空间效果')
  const photoTask = (async () => {
    const path = await download(preview(photo, true), session)
    try { return await pixelsFromPath(path, session, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))) } finally { removeTemporary(path) }
  })()
  const [image, depth] = await Promise.all([photoTask, depthFor(photo.id, session, onStatus)])
  ensureActive(session)
  return { image, depth: depth as PixelImage }
}
export function createRenderer(canvas: any, image: PixelImage, depth: PixelImage, width: number, height: number) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false }) as WebGLRenderingContext
  if (!gl) throw new Error('当前设备暂不支持空间效果')
  const shaders: WebGLShader[] = [], textures: WebGLTexture[] = []
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, frame: number | null = null, disposed = false
  const dispose = () => { if (disposed) return; disposed = true; if (frame != null) canvas.cancelAnimationFrame(frame); frame = null; for (const texture of textures) gl.deleteTexture(texture); for (const shader of shaders) gl.deleteShader(shader); if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program) }
  try {
    program = gl.createProgram(); if (!program) throw new Error('空间效果初始化失败')
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type); if (!shader) throw new Error('着色器创建失败')
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('空间场景着色器初始化失败')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('空间场景渲染初始化失败')
    gl.useProgram(program)
    buffer = gl.createBuffer(); if (!buffer) throw new Error('空间场景缓冲区创建失败'); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    for (const [unit, name, source, channels] of [[0, 'u_photo', image, 4], [1, 'u_depth', depth, 1]] as const) {
      if (source.values.length !== source.width * source.height * channels) throw new Error('空间图片像素异常')
      const size = fitTexture(source.width, source.height, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)))
      const values = size.width === source.width && size.height === source.height ? source.values : resizeSpatialPixels(source.values, source.width, source.height, channels, size.width, size.height)
      const texture = gl.createTexture(); if (!texture) throw new Error('纹理创建失败'); textures.push(texture)
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      const format = channels === 4 ? gl.RGBA : gl.LUMINANCE
      gl.texImage2D(gl.TEXTURE_2D, 0, format, size.width, size.height, 0, format, gl.UNSIGNED_BYTE, values)
      if (gl.getError() !== gl.NO_ERROR) throw new Error('当前设备无法上传空间纹理，请重新打开')
      gl.uniform1i(gl.getUniformLocation(program, name), unit)
    }
    const offset = gl.getUniformLocation(program, 'u_offset'), target = { x: 0, y: 0 }, current = { x: 0, y: 0 }
    const draw = () => { frame = null; if (disposed) return; current.x += (target.x - current.x) * .12; current.y += (target.y - current.y) * .12; gl.uniform2f(offset, current.x * .012, current.y * .008); gl.drawArrays(gl.TRIANGLES, 0, 6); if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > .001) frame = canvas.requestAnimationFrame(draw) }
    const resize = (nextWidth: number, nextHeight: number) => {
      if (disposed) return
      const resolution = Math.min(Taro.getSystemInfoSync().pixelRatio || 1, 1.5, 1600 / Math.max(nextWidth, nextHeight, 1))
      canvas.width = Math.max(1, Math.round(nextWidth * resolution)); canvas.height = Math.max(1, Math.round(nextHeight * resolution))
      gl.viewport(0, 0, canvas.width, canvas.height)
      if (frame != null) canvas.cancelAnimationFrame(frame); frame = null; draw()
    }
    resize(width, height)
    return { dispose, resize, setTarget(x: number, y: number) { target.x = clampSpatialInput(x); target.y = clampSpatialInput(y); if (frame == null && !disposed) frame = canvas.requestAnimationFrame(draw) } }
  } catch (failure) { dispose(); throw failure }
}
