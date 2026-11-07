import SwiftUI
import MapKit

struct CompactPhotoLocationMap: View {
    let photo: Photo
    let config: ClientConfig?
    let active: Bool
    let session: PhotoPreviewSession?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale
    @State private var image: UIImage?
    @State private var rendered: Request?
    @State private var snapshotter: MKMapSnapshotter?

    private struct Request: Equatable {
        let size: CGSize
        let dark: Bool
        let active: Bool
    }

    var body: some View {
        GeometryReader { geometry in
            let request = Request(size: geometry.size, dark: colorScheme == .dark, active: active)
            // Keep the task attached to a view even before the first bitmap arrives.
            Color.clear
                .overlay {
                    if let image {
                        Image(uiImage: image).resizable()
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .scaleEffect(1.06)
                            .saturation(0.25)
                            .blur(radius: 3)
                            .opacity(0.46)
                    }
                }
                .task(id: request) { await load(request) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: active) { _, active in if !active { snapshotter?.cancel() } }
        .onDisappear { snapshotter?.cancel() }
    }

    private func load(_ request: Request) async {
        guard request.active, request != rendered, request.size.width >= 40, request.size.height >= 32 else { return }
        await session?.waitUntilPresented()
        guard !Task.isCancelled, session?.phase != .finished, let point = await coordinate(), !Task.isCancelled else { return }

        let options = MKMapSnapshotter.Options()
        options.size = request.size
        options.traitCollection = UITraitCollection { traits in
            traits.userInterfaceStyle = request.dark ? .dark : .light
            traits.displayScale = displayScale
        }
        let style = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
        style.pointOfInterestFilter = .excludingAll
        options.preferredConfiguration = style
        options.region = MKCoordinateRegion(center: point, latitudinalMeters: 650, longitudinalMeters: 1_800)

        snapshotter?.cancel()
        let snapshot = MKMapSnapshotter(options: options)
        snapshotter = snapshot
        defer { if snapshotter === snapshot { snapshotter = nil } }
        guard let result = try? await snapshot.start(), !Task.isCancelled, snapshotter === snapshot else { return }
        image = result.image
        rendered = request
    }

    private func coordinate() async -> CLLocationCoordinate2D? {
        if photo.hasCoordinate, let latitude = photo.latitude, let longitude = photo.longitude {
            return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
        guard let url = config?.mediaURL(GalleryCatalogEngine.media(photo, detail: true).original),
              let point = try? await PhotoGeoReader.shared.read(url) else { return nil }
        return CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude)
    }
}
