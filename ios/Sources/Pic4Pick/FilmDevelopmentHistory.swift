import Foundation

// Lazy grid cells can disappear and return during one visit to the film section.
// Replay on a new visit, not every time a cell resumes its image task.
struct FilmDevelopmentHistory: Sendable {
    private var session: UUID?
    private var photos: Set<String> = []

    func needsDevelopment(photoID: String, session: UUID) -> Bool {
        self.session != session || !photos.contains(photoID)
    }

    mutating func claim(photoID: String, session: UUID) -> Bool {
        if self.session != session {
            self.session = session
            photos.removeAll(keepingCapacity: true)
        }
        return photos.insert(photoID).inserted
    }
}
