import Foundation

/// Validates non-secret installed extension metadata. No private profile or entitlement is read.
struct BroadcastInstallation {
    static let uploadPoint = "com.apple.broadcast-services-upload"
    static let setupPoint = "com.apple.broadcast-services-setupui"

    static func validate(_ manifests: [[String: Any]]) throws {
        func matching(_ point: String) -> [[String: Any]] {
            manifests.filter { info in
                let extensionInfo = info["NSExtension"] as? [String: Any]
                return (extensionInfo?["NSExtensionPointIdentifier"] as? String) == point
            }
        }
        let uploads = matching(uploadPoint)
        let setups = matching(setupPoint)
        guard uploads.count == 1, setups.count == 1 else {
            throw ScreenError.message("No se encuentran las dos extensiones de Pulso Screen. Reinstala el IPA conservando las extensiones de transmisión y configuración.")
        }
        guard let uploadID = uploads[0]["CFBundleIdentifier"] as? String,
              let setupExtension = setups[0]["NSExtension"] as? [String: Any],
              let attributes = setupExtension["NSExtensionAttributes"] as? [String: Any],
              (attributes["RPBroadcastUploadExtension"] as? String) == uploadID else {
            throw ScreenError.message("Los identificadores de las extensiones no coinciden. El instalador puede haberlos cambiado. Reinstala conservando ambas extensiones y sus identificadores.")
        }
    }
}
