import Foundation

/// Step log for the setup screen. It is uploaded to the pairing room so the
/// Windows monitor can show it. It never contains the link or the key.
enum SetupDiagnostics {
    private static var lines: [String] = []
    private static let clock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    static func note(_ message: String, pairing: PairingLink?) {
        lines.append("\(clock.string(from: Date())) setup: \(message)")
        if lines.count > 20 { lines.removeFirst(lines.count - 20) }
        guard let pairing else { return }
        var request = URLRequest(url: pairing.endpoint.appendingPathComponent("diag"))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue(pairing.key, forHTTPHeaderField: "X-Pulso-Camera")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["source": "setup", "lines": lines])
        URLSession.shared.dataTask(with: request).resume()
    }
}
