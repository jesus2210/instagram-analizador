import ReplayKit
import CoreMedia

final class SampleHandler: RPBroadcastSampleHandler {
    private var bridge: ScreenBridge?

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        do {
            guard let value = setupInfo?["pairingURL"] as? String else {
                throw ScreenError.message("Configura primero el enlace de Pulso Screen. No se puede iniciar desde el Centro de control sin preparar el monitor.")
            }
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
