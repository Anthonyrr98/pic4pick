import Foundation

#if !SWIFT_PACKAGE
extension Bundle {
    static let module = Bundle.main
}
#endif
