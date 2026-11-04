import Foundation
import CoreMedia
import CoreVideo
import ImageIO
import ReplayKit
import WebRTC

/// The ReplayKit extension owns the peer connection, so the host app need not stay foregrounded.
/// This prototype still requires a real-device memory and lifecycle test before normal use.
final class ScreenBridge: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    private let pairing: PairingLink
    private let onFailure: (String) -> Void
    private let queue = DispatchQueue(label: "app.pulso.screen.signaling")
    private let frameLock = NSLock()
    private let session: URLSession
    private let factory: RTCPeerConnectionFactory
    private let source: RTCVideoSource
    private let capturer: RTCVideoCapturer
    private var peer: RTCPeerConnection?
    private var channel: RTCDataChannel?
    private var active = true
    private var connected = false
    private var paused = false
    private var canPostOffer = false
    private var offerPosted = false
    private var lastFrame: Double = 0
    private var outputSize = ""
    private let senderID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()

    init(pairing: PairingLink, onFailure: @escaping (String) -> Void) {
        self.pairing = pairing
        self.onFailure = onFailure
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        self.session = URLSession(configuration: configuration)
        RTCInitializeSSL()
        let encoder = RTCDefaultVideoEncoderFactory()
        if let h264 = encoder.supportedCodecs().first(where: { $0.name == "H264" }) {
            encoder.preferredCodec = h264
        }
        // Build dependencies as locals before assigning stored properties: Swift
        // must not read self.factory/self.source before NSObject's super.init().
        let rtcFactory = RTCPeerConnectionFactory(encoderFactory: encoder, decoderFactory: RTCDefaultVideoDecoderFactory())
        let videoSource = rtcFactory.videoSource()
        self.factory = rtcFactory
        self.source = videoSource
        self.capturer = RTCVideoCapturer(delegate: videoSource)
        super.init()
        // Do not contend with Camera's recording microphone or activate WebRTC audio.
        RTCAudioSession.sharedInstance().useManualAudio = true
        RTCAudioSession.sharedInstance().isAudioEnabled = false
    }

    func start() {
        queue.async { [weak self] in self?.begin() }
    }

    private func begin() {
        guard active else { return }
        request(method: "GET") { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error): self.fail(error.localizedDescription)
            case .success(let data):
                guard data["mode"] as? String == "screen" else {
                    self.fail("Genera un QR en el modo Pantalla del iPhone de Pulso.")
                    return
                }
                self.makeOffer()
            }
        }
    }

    private func makeOffer() {
        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        config.bundlePolicy = .maxBundle
        config.iceServers = [RTCIceServer(urlStrings: ["stun:stun.cloudflare.com:3478"])]
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        guard let connection = factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            fail("No se pudo preparar el envío de pantalla.")
            return
        }
        peer = connection
        let track = factory.videoTrack(with: source, trackId: "pulso-screen")
        connection.add(track, streamIds: ["pulso-screen"])
        channel = connection.dataChannel(forLabel: "pulso-camera", configuration: RTCDataChannelConfiguration())
        channel?.delegate = self
        let offerConstraints = RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "false", "OfferToReceiveVideo": "false"], optionalConstraints: nil)
        connection.offer(for: offerConstraints) { [weak self] offer, error in
            guard let self else { return }
            self.queue.async {
                guard self.active, error == nil, let offer else {
                    if self.active { self.fail("No se pudo negociar el monitor.") }
                    return
                }
                connection.setLocalDescription(offer) { [weak self] error in
                    guard let self else { return }
                    self.queue.async {
                        guard self.active, error == nil else {
                            if self.active { self.fail("No se pudo preparar la conexión del iPhone.") }
                            return
                        }
                        self.canPostOffer = true
                        if connection.iceGatheringState == .complete { self.postOffer() }
                        self.queue.asyncAfter(deadline: .now() + 8) { [weak self] in self?.postOffer() }
                    }
                }
            }
        }
    }

    private func postOffer() {
        guard active, canPostOffer, !offerPosted, let sdp = peer?.localDescription?.sdp else { return }
        guard sdp.contains("a=candidate:") else {
            fail("La red no permite conectar. Usa la misma Wi-Fi sin VPN ni aislamiento de invitados.")
            return
        }
        offerPosted = true
        request(path: "offer", method: "POST", body: ["senderId": senderID, "source": "screen", "description": ["type": "offer", "sdp": sdp]]) { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error): self.fail(error.localizedDescription)
            case .success: self.pollAnswer(until: Date().addingTimeInterval(45))
            }
        }
    }

    private func pollAnswer(until deadline: Date) {
        guard active, !connected else { return }
        guard Date() < deadline else { fail("La laptop no respondió. Genera un QR nuevo y vuelve a emparejar."); return }
        request(method: "GET") { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error): self.fail(error.localizedDescription)
            case .success(let data):
                if let description = data["description"] as? [String: Any], description["type"] as? String == "answer", let sdp = description["sdp"] as? String {
                    self.peer?.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp)) { [weak self] error in
                        guard let self else { return }
                        self.queue.async {
                            if error != nil { self.fail("El monitor devolvió una respuesta incompatible."); return }
                            self.limitSender()
                            self.queue.asyncAfter(deadline: .now() + 30) { [weak self] in
                                if let self, self.active, !self.connected { self.fail("No llegó a establecerse la imagen. Comprueba la red y genera otro QR.") }
                            }
                        }
                    }
                } else {
                    self.queue.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.pollAnswer(until: deadline) }
                }
            }
        }
    }

    private func limitSender() {
        guard let sender = peer?.senders.first(where: { $0.track?.kind == "video" }) else { return }
        let parameters = sender.parameters
        parameters.encodings.forEach {
            $0.maxBitrateBps = NSNumber(value: 2_000_000)
            $0.maxFramerate = NSNumber(value: 15)
        }
        sender.parameters = parameters
    }

    func process(_ sample: CMSampleBuffer) {
        guard frameLock.try() else { return }
        defer { frameLock.unlock() }
        guard active, connected, !paused, CMSampleBufferDataIsReady(sample),
              let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else { return }
        let timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
        guard timestamp.isFinite, timestamp - lastFrame >= 1.0 / 15.0 else { return }
        lastFrame = timestamp
        let width = CVPixelBufferGetWidth(pixelBuffer), height = CVPixelBufferGetHeight(pixelBuffer)
        guard width > 0, height > 0 else { return }
        let scale = min(1.0, min(1280.0 / Double(max(width, height)), 720.0 / Double(min(width, height))))
        let targetWidth = max(16, Int(Double(width) * scale) / 2 * 2)
        let targetHeight = max(16, Int(Double(height) * scale) / 2 * 2)
        let size = "\(targetWidth)x\(targetHeight)"
        if size != outputSize {
            source.adaptOutputFormat(toWidth: Int32(targetWidth), height: Int32(targetHeight), fps: 15)
            outputSize = size
        }
        let attachment = CMGetAttachment(sample, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber
        let orientation = CGImagePropertyOrientation(rawValue: attachment?.uint32Value ?? 1) ?? .up
        let rotation: RTCVideoRotation
        switch orientation {
        case .right, .rightMirrored: rotation = ._90
        case .down, .downMirrored: rotation = ._180
        case .left, .leftMirrored: rotation = ._270
        default: rotation = ._0
        }
        let frame = RTCVideoFrame(buffer: RTCCVPixelBuffer(pixelBuffer: pixelBuffer), rotation: rotation, timeStampNs: Int64(timestamp * 1_000_000_000))
        source.capturer(capturer, didCapture: frame)
    }

    func setPaused(_ value: Bool) { frameLock.lock(); paused = value; frameLock.unlock() }

    private func send(_ object: [String: Any]) {
        guard channel?.readyState == .open, let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        channel?.sendData(RTCDataBuffer(data: data, isBinary: false))
    }

    private func reportReady() {
        send(["type": "ready", "source": "screen"])
        send(["type": "record-state", "source": "screen", "state": "idle", "supported": false, "clipReady": false])
    }

    func stop() { queue.async { self.close() } }
    private func close() {
        guard active else { return }
        frameLock.lock(); active = false; connected = false; frameLock.unlock()
        send(["type": "end"])
        channel?.close(); channel = nil
        peer?.close(); peer = nil
        session.invalidateAndCancel()
    }
    private func fail(_ message: String) {
        guard active else { return }
        send(["type": "error", "message": message])
        close()
        onFailure(message)
    }

    private func request(path: String = "", method: String, body: [String: Any]? = nil, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard active else { return }
        let url = path.isEmpty ? pairing.endpoint : pairing.endpoint.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(pairing.key, forHTTPHeaderField: "X-Pulso-Camera")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try? JSONSerialization.data(withJSONObject: body) }
        session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            self.queue.async {
                guard self.active else { return }
                guard error == nil, let http = response as? HTTPURLResponse else {
                    completion(.failure(ScreenError.message("No se pudo contactar con Pulso. Comprueba la conexión.")))
                    return
                }
                guard (200...299).contains(http.statusCode), let data,
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    let message = http.statusCode == 404 ? "El QR ha caducado. Genera uno nuevo en Windows." : "No se pudo emparejar. Comprueba que el QR sea nuevo y del modo Pantalla del iPhone."
                    completion(.failure(ScreenError.message(message)))
                    return
                }
                completion(.success(object))
            }
        }.resume()
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        queue.async { [weak self] in
            guard let self, self.active else { return }
            if newState == .connected || newState == .completed {
                self.frameLock.lock(); self.connected = true; self.frameLock.unlock()
            }
            if newState == .failed { self.fail("La red interrumpió la transmisión. Vuelve a emparejar.") }
        }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        if newState == .complete { queue.async { [weak self] in self?.postOffer() } }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        if dataChannel.readyState == .open { queue.async { [weak self] in self?.reportReady() } }
    }
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard !buffer.isBinary, buffer.data.count < 200,
              let message = try? JSONSerialization.jsonObject(with: buffer.data) as? [String: Any] else { return }
        queue.async { [weak self] in
            if message["type"] as? String == "hello" { self?.reportReady() }
            if message["type"] as? String == "end" { self?.fail("Transmisión finalizada desde la laptop.") }
        }
    }
}
