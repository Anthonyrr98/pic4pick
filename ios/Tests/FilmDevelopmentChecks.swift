import Foundation

@main
struct FilmDevelopmentChecks {
    static func main() {
        var history = FilmDevelopmentHistory()
        let first = UUID(), second = UUID()
        precondition(history.needsDevelopment(photoID: "landscape", session: first))
        precondition(history.needsDevelopment(photoID: "landscape", session: first), "Preparing a negative must not consume its animation")
        precondition(history.claim(photoID: "landscape", session: first))
        precondition(!history.needsDevelopment(photoID: "landscape", session: first))
        precondition(history.claim(photoID: "portrait", session: first))
        precondition(!history.claim(photoID: "landscape", session: first), "Scrolling back must not replay development")
        precondition(!history.claim(photoID: "portrait", session: first))
        precondition(history.needsDevelopment(photoID: "landscape", session: second))
        precondition(history.claim(photoID: "landscape", session: second), "A fresh film visit should develop again")
        precondition(!history.claim(photoID: "landscape", session: second))
        precondition(history.claim(photoID: "portrait", session: second))
        print("Film development checks passed: one animation per photo per visit.")
    }
}
