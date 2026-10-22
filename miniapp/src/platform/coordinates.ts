// Existing EXIF/GPS values are WGS84. Native WeChat maps display GCJ02 in China.
// Keep original database coordinates; convert only at the map boundary.
const pi = Math.PI
const outsideChina = (lat: number, lng: number) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
function offset(x: number, y: number) {
  let lat = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x))
  let lng = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x))
  const common = (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3
  lat += common + (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3 + (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3
  lng += common + (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3 + (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3
  return { lat, lng }
}
export function toMapCoordinates(lat: number, lng: number) {
  if (outsideChina(lat, lng)) return { latitude: lat, longitude: lng }
  const delta = offset(lng - 105, lat - 35)
  const radians = lat / 180 * pi
  const magic = 1 - .00669342162296594323 * Math.sin(radians) ** 2
  const root = Math.sqrt(magic)
  return { latitude: lat + delta.lat * 180 / ((6378245 * (1 - .00669342162296594323) / (magic * root)) * pi), longitude: lng + delta.lng * 180 / ((6378245 / root * Math.cos(radians)) * pi) }
}
export function fromMapCoordinates(latitude: number, longitude: number) {
  let lat = latitude, lng = longitude
  for (let i = 0; i < 4; i += 1) { const converted = toMapCoordinates(lat, lng); lat -= converted.latitude - latitude; lng -= converted.longitude - longitude }
  return { latitude: lat, longitude: lng }
}
