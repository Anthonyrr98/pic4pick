import type { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import 'core-js/actual/url'
import 'core-js/actual/url-search-params'
import './app.scss'

// wx runtime does not consistently supply the standard URL APIs used by shared media rules.
export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    for (const [family, url] of [['Playfair Display', __PIC4PICK_CONFIG__.titleFontUrl], ['Noto Sans SC', __PIC4PICK_CONFIG__.bodyFontUrl]]) {
      if (url) void Taro.loadFontFace({ family, source: `url("${url}")`, global: true }).catch(() => undefined)
    }
  })
  return children
}
