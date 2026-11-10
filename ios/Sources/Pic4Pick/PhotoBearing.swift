import Foundation

enum PhotoBearing {
    static func degrees(fromLatitude latitude: Double, longitude: Double,
        toLatitude targetLatitude: Double, longitude targetLongitude: Double) -> Double {
        let radians = Double.pi / 180
        let start = latitude * radians
        let end = targetLatitude * radians
        let delta = (targetLongitude - longitude) * radians
        let east = sin(delta) * cos(end)
        let north = cos(start) * sin(end) - sin(start) * cos(end) * cos(delta)
        let angle = atan2(east, north) / radians
        return (angle + 360).truncatingRemainder(dividingBy: 360)
    }

    // Match the Mapbox photo marker's inverse conversion for legacy AMap points.
    static func gpsFromAMap(latitude: Double, longitude: Double) -> (latitude: Double, longitude: Double) {
        var lat = latitude
        var lon = longitude
        for _ in 0..<4 {
            guard (0.8293...55.8271).contains(lat), (72.004...137.8347).contains(lon) else {
                return (lat, lon)
            }
            let x = lon - 105
            let y = lat - 35
            let pi = Double.pi
            let common = (20 * sin(6 * x * pi) + 20 * sin(2 * x * pi)) * 2 / 3
            let latWaves = (20 * sin(y * pi) + 40 * sin(y / 3 * pi)) * 2 / 3
                + (160 * sin(y / 12 * pi) + 320 * sin(y * pi / 30)) * 2 / 3
            let lonWaves = (20 * sin(x * pi) + 40 * sin(x / 3 * pi)) * 2 / 3
                + (150 * sin(x / 12 * pi) + 300 * sin(x / 30 * pi)) * 2 / 3
            let latOffset = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x)) + common + latWaves
            let lonOffset = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x)) + common + lonWaves
            let radians = lat * pi / 180
            let eccentricitySquared = 0.00669342162296594323
            let magic = 1 - eccentricitySquared * pow(sin(radians), 2)
            let root = sqrt(magic)
            let equatorialRadius = 6_378_245.0
            let meridianRadius = equatorialRadius * (1 - eccentricitySquared) / (magic * root)
            let parallelRadius = equatorialRadius / root * cos(radians)
            lat = latitude - latOffset * 180 / (meridianRadius * pi)
            lon = longitude - lonOffset * 180 / (parallelRadius * pi)
        }
        return (lat, lon)
    }
}
