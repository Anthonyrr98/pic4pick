// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pic4Pick",
    platforms: [.iOS(.v17)],
    products: [.library(name: "Pic4Pick", targets: ["Pic4Pick"])],
    targets: [.target(name: "Pic4Pick", exclude: [
        "AdminAPI.swift", "AdminContract.swift", "AdminStore.swift",
        "AdminUpload.swift", "AdminViews.swift", "AdminSettingsView.swift"
    ], resources: [.process("Resources")])]
)
