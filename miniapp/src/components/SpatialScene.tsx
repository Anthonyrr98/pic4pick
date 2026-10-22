import { useEffect, useRef, useState } from 'react'
import Taro, { useDidHide } from '@tarojs/taro'
import { Button, Canvas, Text, View, type ITouchEvent } from '@tarojs/components'
import type { GalleryPhoto } from '../../../packages/shared/photoDataUtils'
import { orientationToSpatialInput } from '../../../packages/shared/spatialCore'
import { createRenderer, createSpatialSession, loadSpatialImages } from '../platform/spatial'
export default function SpatialScene({ photo, onClose }: { photo: GalleryPhoto; onClose: () => void }) {
  const [status, setStatus] = useState('正在初始化空间效果…')
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const renderer = useRef<ReturnType<typeof createRenderer> | null>(null)
  const dispose = useRef<() => void>(() => {})
  useDidHide(() => { dispose.current(); onClose() })
  useEffect(() => {
    const session = createSpatialSession()
    let aspect = 1, initialized = false
    let baseline: { beta: number; gamma: number } | null = null
    const motion = (event: Taro.onDeviceMotionChange.CallbackResult) => {
      const beta = event.beta * 180 / Math.PI, gamma = event.gamma * 180 / Math.PI
      if (!baseline) baseline = { beta, gamma }
      const input = orientationToSpatialInput(beta, gamma, baseline)
      renderer.current?.setTarget(input.x, input.y)
    }
    const resize = () => {
      baseline = null
      if (!initialized || session.cancelled) return
      Taro.createSelectorQuery().select('.spatial-viewport').boundingClientRect().exec(results => {
        const rect = results[0]; if (!rect || session.cancelled) return
        const width = Math.min(rect.width, rect.height * aspect), height = width / aspect
        setSize({ width, height }); renderer.current?.resize(width, height)
      })
    }
    const stopMotion = () => { try { void Promise.resolve(Taro.stopDeviceMotionListening()).catch(() => {}) } catch { /* Already stopped by the host. */ } }
    const cleanup = () => { session.cancel(); renderer.current?.dispose(); renderer.current = null; Taro.offWindowResize(resize); Taro.offDeviceMotionChange(motion); stopMotion() }
    dispose.current = cleanup
    Taro.onWindowResize(resize)
    Taro.nextTick(() => {
      Taro.createSelectorQuery().select('#spatial-canvas').fields({ node: true, size: true }).exec(async results => {
        try {
          const result = results[0]; if (!result?.node) throw new Error('空间画布尚未就绪')
          const { image, depth } = await loadSpatialImages(result.node, photo, session, setStatus)
          if (session.cancelled) return
          aspect = image.width / image.height
          const width = Math.min(result.width, result.height * aspect), height = width / aspect
          setSize({ width, height }); renderer.current = createRenderer(result.node, image, depth, width, height)
          initialized = true
          resize()
          setReady(true); setStatus('拖动或轻轻倾斜手机')
          Taro.onDeviceMotionChange(motion)
          try { await Taro.startDeviceMotionListening({ interval: 'game' }); if (session.cancelled) stopMotion() }
          catch { if (!session.cancelled) setStatus('方向感应不可用，可以拖动体验') }
        } catch (failure) { if (!session.cancelled) { setStatus((failure as any).message || (failure as any).errMsg || '空间效果加载失败'); setReady(false); cleanup() } }
      })
    })
    return cleanup
  }, [photo.id])
  const touch = (event: ITouchEvent) => {
    event.stopPropagation()
    const point = event.touches[0]; if (!point) return
    Taro.createSelectorQuery().select('#spatial-canvas').boundingClientRect().exec(results => { const rect = results[0]; if (rect) renderer.current?.setTarget((point.clientX - rect.left) / rect.width * 2 - 1, (point.clientY - rect.top) / rect.height * 2 - 1) })
  }
  return <View className='spatial-layer' onTouchMove={event => touch(event as ITouchEvent)} onTouchStart={event => touch(event as ITouchEvent)} onTouchEnd={event => { event.stopPropagation(); renderer.current?.setTarget(0, 0) }}>
    <View className='spatial-viewport'><Canvas id='spatial-canvas' canvasId='spatial-canvas' type='webgl' className='spatial-canvas' style={size.width ? { width: `${size.width}px`, height: `${size.height}px` } : undefined} /></View>
    <View className='spatial-status'><Text>{status}</Text><Button onClick={event => { event.stopPropagation(); onClose() }}>{ready ? '关闭空间效果' : '返回照片'}</Button></View>
  </View>
}
