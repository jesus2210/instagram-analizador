import Foundation

/// The production host is fixed: a QR cannot redirect screen frames or credentials to another server.
struct PairingLink {
    static let baseURL = URL(string: "https://instagram-analizador.vercel.app")!
    let room: String
    let key: String

    init(_ value: String) throws {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw ScreenError.message("Pega el enlace completo del QR de Pulso.")
        }
        let items: [URLQueryItem]
        if parts.scheme == "pulsoscreen", parts.host == "pair", parts.user == nil, parts.password == nil, parts.port == nil, ["", "/"].contains(parts.path) {
            items = parts.queryItems ?? []
        } else if parts.scheme == "https", parts.host == Self.baseURL.host,
                  parts.port == nil, parts.user == nil, parts.password == nil,
                  ["/screen", "/screen/"].contains(parts.path) {
            items = URLComponents(string: "?" + (parts.fragment ?? ""))?.queryItems ?? []
        } else {
            throw ScreenError.message("Usa un enlace de compartir pantalla del sitio oficial de Pulso.")
        }
        guard items.filter({ $0.name == "room" }).count == 1,
              items.filter({ $0.name == "key" }).count == 1,
              let room = items.first(where: { $0.name == "room" })?.value,
              let key = items.first(where: { $0.name == "key" })?.value,
              room.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
              key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw ScreenError.message("El enlace está incompleto. Genera otro QR en la laptop.")
        }
        self.room = room
        self.key = key
    }

    var webURL: URL {
        var parts = URLComponents(url: Self.baseURL.appendingPathComponent("screen"), resolvingAgainstBaseURL: false)!
        parts.fragment = "room=\(room)&key=\(key)"
        return parts.url!
    }

    var endpoint: URL { Self.baseURL.appendingPathComponent("api/camera/rooms/\(room)") }
}

enum ScreenError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let value): return value }
    }
}
