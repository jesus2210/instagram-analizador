import Foundation

/// Moves the pairing from the app to the broadcast extension through the Pulso
/// server, because free signing cannot share data between the two processes.
enum PairingHandoff {
    private static var base: URL { PairingLink.baseURL.appendingPathComponent("api/camera/handoff") }

    private static func post(_ url: URL, body: [String: String], completion: @escaping (Int, [String: Any]?) -> Void) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession(configuration: configuration).dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            completion(status, object)
        }.resume()
    }

    /// App side: leave the pairing for the extension.
    static func offer(_ link: PairingLink, completion: @escaping (Error?) -> Void) {
        post(base, body: ["room": link.room, "key": link.key]) { status, _ in
            if (200...299).contains(status) { completion(nil); return }
            completion(ScreenError.message(status == 404 ? "El QR ha caducado. Genera uno nuevo en Windows en el modo Pantalla del iPhone." : "No se pudo preparar el emparejamiento. Comprueba la conexión."))
        }
    }

    /// Extension side: returns the web link of the pairing, retrying briefly.
    static func claim(attempt: Int = 0, completion: @escaping (Result<String, Error>) -> Void) {
        post(base.appendingPathComponent("claim"), body: [:]) { status, object in
            if let room = object?["room"] as? String, let key = object?["key"] as? String {
                completion(.success("\(PairingLink.baseURL.absoluteString)/screen#room=\(room)&key=\(key)"))
            } else if attempt < 4 {
                DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) { claim(attempt: attempt + 1, completion: completion) }
            } else {
                completion(.failure(ScreenError.message(status == 404 ? "No hay un emparejamiento pendiente. Pulsa Preparar transmisión en Pulso Screen y vuelve a empezar." : "No se pudo contactar con Pulso para emparejar.")))
            }
        }
    }
}
