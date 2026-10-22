export interface DetailGeo { latitude: number | null; longitude: number | null; altitude: number | null; altitudeSource: 'exif' | 'record' | 'terrain' | null }
export interface ExifGeo { latitude?: unknown; longitude?: unknown; GPSAltitude?: unknown }
const finite = (value: unknown): number | null => {
  if (value == null || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
function pair(latitude: unknown, longitude: unknown) {
  const lat = finite(latitude), lon = finite(longitude)
  return lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { latitude: lat, longitude: lon } : null
}
// Keep the website's EXIF -> persisted record -> terrain altitude priority.
export function resolveDetailGeo(record: { latitude?: unknown; longitude?: unknown; altitude?: unknown }, exif?: ExifGeo | null, terrain?: unknown): DetailGeo {
  const coordinates = pair(exif?.latitude, exif?.longitude) || pair(record.latitude, record.longitude)
  const candidates = [[finite(exif?.GPSAltitude), 'exif'], [finite(record.altitude), 'record'], [finite(terrain), 'terrain']] as const
  const altitude = candidates.find(([value]) => value != null)
  return { latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null, altitude: altitude?.[0] ?? null, altitudeSource: altitude?.[1] ?? null }
}
