import ReplayKit
import CoreMedia

final class SampleHandler: RPBroadcastSampleHandler {
    private var bridge: ScreenBridge?

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        if let value = setupInfo?["pairingURL"] as? String {
            begin(with: value)
            return
        }
        // Started from the system picker: no setup UI, so claim the pairing the app left on the server.
        PairingHandoff.claim { [weak self] result in
            switch result {
            case .success(let value): self?.begin(with: value)
            case .failure(let error): self?.finishBroadcastWithError(error)
            }
        }
    }

    private func begin(with value: String) {
        do {
            let pairing = try PairingLink(value)
            let bridge = ScreenBridge(pairing: pairing) { [weak self] message in
                self?.finishBroadcastWithError(NSError(domain: "PulsoScreen", code: 1, userInfo: [NSLocalizedDescriptionKey: message]))
            }
            self.bridge = bridge
            bridge.start()
        } catch { finishBroadcastWithError(error) }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        // ReplayKit supplies screen pixels. This extension never opens the camera or microphone.
        guard sampleBufferType == .video else { return }
        bridge?.process(sampleBuffer)
    }

    override func broadcastPaused() { bridge?.setPaused(true) }
    override func broadcastResumed() { bridge?.setPaused(false) }
    override func broadcastFinished() { bridge?.stop(); bridge = nil }
}
