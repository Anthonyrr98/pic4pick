export type TencentMapStyle = { subkey: string; layerStyle: number }

// Style IDs belong to a specific Tencent key; never infer one from a web preset.
export function resolveTencentMapStyle(subkeyValue: string, styleValue: string): TencentMapStyle | null {
  const subkey = subkeyValue.trim()
  const style = styleValue.trim()
  if (!subkey && !style) return null
  if (!subkey || !style) throw new Error('微信地图个性化样式需同时配置 PIC4PICK_TENCENT_MAP_SUBKEY 和 PIC4PICK_TENCENT_MAP_STYLE_ID')
  if (!/^\d+$/.test(style) || !Number.isSafeInteger(Number(style)) || Number(style) < 1) {
    throw new Error('PIC4PICK_TENCENT_MAP_STYLE_ID 必须是平台提供的正整数样式编号')
  }
  return { subkey, layerStyle: Number(style) }
}
