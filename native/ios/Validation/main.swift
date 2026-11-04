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
