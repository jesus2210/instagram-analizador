import Foundation

let room = String(repeating: "a", count: 32)
let key = String(repeating: "b", count: 64)
let valid = "https://instagram-analizador.vercel.app/screen#room=\(room)&key=\(key)"
func require(_ condition: Bool, _ message: String) {
    if !condition { fatalError(message) }
}
do {
    let parsed = try PairingLink(valid)
    require(parsed.room == room && parsed.key == key, "Expected exact pairing values")
    require(parsed.webURL.fragment?.contains(key) == true, "Secret belongs only in fragment")
    require(parsed.endpoint.query == nil && !parsed.endpoint.absoluteString.contains(key), "API URL must never contain sender secret")
    let custom = try PairingLink("pulsoscreen://pair?room=\(room)&key=\(key)")
    require(custom.room == room && custom.key == key, "Custom scheme should preserve pairing")
    let invalid = [
        valid.replacingOccurrences(of: "https://", with: "http://"),
        valid.replacingOccurrences(of: "instagram-analizador.vercel.app", with: "untrusted.invalid"),
        valid.replacingOccurrences(of: "/screen#", with: "/camera#"),
        valid + "&key=" + key,
        "https://instagram-analizador.vercel.app/screen#room=short&key=\(key)",
        "pulsoscreen://other?room=\(room)&key=\(key)",
        "https://user:pass@instagram-analizador.vercel.app/screen#room=\(room)&key=\(key)"
    ]
    for link in invalid {
        var rejected = false
        do { _ = try PairingLink(link) } catch { rejected = true }
        require(rejected, "Untrusted or ambiguous pairing link accepted")
    }
    print("Pairing validation passed: official origin, strict IDs, duplicate rejection and secret-free API URL.")
} catch {
    fatalError("Pairing validation failed")
}

func uploadManifest(_ identifier: String) -> [String: Any] {
    ["CFBundleIdentifier": identifier, "NSExtension": [
        "NSExtensionPointIdentifier": BroadcastInstallation.uploadPoint,
        "RPBroadcastProcessMode": "RPBroadcastProcessModeSampleBuffer"
    ]]
}
func setupManifest(_ uploadID: String) -> [String: Any] {
    ["CFBundleIdentifier": "dev.pulso.test.setup", "NSExtension": [
        "NSExtensionPointIdentifier": BroadcastInstallation.setupPoint,
        "NSExtensionAttributes": [
            "RPBroadcastUploadExtension": uploadID,
            "NSExtensionActivationRule": ["NSExtensionActivationSupportsReplayKitStreaming": true]
        ]
    ]]
}
do {
    let upload = uploadManifest("dev.pulso.test.broadcast")
    let setup = setupManifest("dev.pulso.test.broadcast")
    let selectedID = try BroadcastInstallation.validate([upload, setup])
    require(selectedID == "dev.pulso.test.setup", "ReplayKit must prefer the installed setup UI, not the upload service")
    let misplacedMode: [String: Any] = ["CFBundleIdentifier": "dev.pulso.test.broadcast", "NSExtension": [
        "NSExtensionPointIdentifier": BroadcastInstallation.uploadPoint,
        "NSExtensionAttributes": ["RPBroadcastProcessMode": "RPBroadcastProcessModeSampleBuffer"]
    ]]
    let inactiveSetup: [String: Any] = ["CFBundleIdentifier": "dev.pulso.test.setup", "NSExtension": [
        "NSExtensionPointIdentifier": BroadcastInstallation.setupPoint,
        "NSExtensionAttributes": ["RPBroadcastUploadExtension": "dev.pulso.test.broadcast"]
    ]]
    for manifests in [[], [upload], [setup], [upload, upload, setup], [upload, setupManifest("dev.pulso.changed.broadcast")], [misplacedMode, setup], [upload, inactiveSetup]] {
        var rejected = false
        do { try BroadcastInstallation.validate(manifests) } catch { rejected = true }
        require(rejected, "Missing, duplicate or mismatched broadcast services accepted")
    }
    print("Installed-service validation passed: identifiers, sample-buffer mode location, setup activation and preferred service checked.")
} catch { fatalError("Installed-service validation failed") }
