import SwiftUI

struct PhotoThumbnail: View {
    let photo: Photo
    let config: ClientConfig
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "photo").foregroundStyle(.secondary)
            }
        }
            .frame(width: 68, height: 68)
            .background(.quaternary)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .task(id: photo.id) {
                if let url = config.mediaURL(photo.thumbnailURL.isEmpty ? photo.imageURL : photo.thumbnailURL) {
                    image = try? await ImageCache.shared.load(url, size: 240)
                }
            }
    }
}
