import UIKit
import ReplayKit

final class ScreenViewController: UIViewController, RPBroadcastActivityViewControllerDelegate, RPBroadcastControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private let linkField = UITextView()
    private let status = UILabel()
    private let prepareButton = UIButton(type: .system)
    private var broadcast: RPBroadcastController?
    private var incoming: URL?
    private var preparation: UUID?
    private var preparationTimeout: DispatchWorkItem?
    private var activityController: RPBroadcastActivityViewController?
    private var broadcastTimeout: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        view.tintColor = .systemBlue
        let title = UILabel()
        title.text = "Pulso Screen"
        title.font = .preferredFont(forTextStyle: .largeTitle)
        title.textColor = .label
        title.adjustsFontForContentSizeCategory = true
        let instructions = UILabel()
        instructions.numberOfLines = 0
        instructions.text = "1. Genera un QR de pantalla en Pulso desde Windows.\n2. Abre el enlace en el iPhone y pégalo aquí.\n3. Prepara y confirma la transmisión en iOS. Cuando Windows muestre la imagen, abre Cámara.\n\nCompartes toda la pantalla, sin audio."
        instructions.font = .preferredFont(forTextStyle: .body)
        instructions.textColor = .secondaryLabel
        instructions.adjustsFontForContentSizeCategory = true
        linkField.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        linkField.textColor = .label
        linkField.backgroundColor = .secondarySystemBackground
        linkField.layer.cornerRadius = 12
        linkField.autocorrectionType = .no
        linkField.autocapitalizationType = .none
        linkField.keyboardType = .URL
        linkField.heightAnchor.constraint(equalToConstant: 95).isActive = true
        linkField.accessibilityLabel = "Enlace privado de emparejamiento"
        let toolbar = UIToolbar()
        toolbar.items = [
            UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil),
            UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(closeKeyboard))
        ]
        toolbar.sizeToFit()
        linkField.inputAccessoryView = toolbar
        let paste = button("Pegar enlace", action: #selector(pasteLink))
        configure(prepareButton, title: "Copiar enlace y preparar transmisión", action: #selector(startBroadcast), primary: true)
        let stop = button("Terminar transmisión", action: #selector(stopBroadcast))
        status.numberOfLines = 0
        status.font = .preferredFont(forTextStyle: .callout)
        status.textColor = .secondaryLabel
        status.adjustsFontForContentSizeCategory = true
        status.accessibilityIdentifier = "pairing-status"
        status.text = "Pega el enlace para preparar la transmisión."
        let version = UILabel()
        version.font = .preferredFont(forTextStyle: .footnote)
        version.textColor = .secondaryLabel
        version.numberOfLines = 0
        let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        version.text = "Pulso Screen \(appVersion) · iOS \(UIDevice.current.systemVersion)"
        let stack = UIStackView(arrangedSubviews: [title, status, instructions, linkField, paste, prepareButton, stop, version])
        stack.axis = .vertical
        stack.spacing = 17
        let scroll = UIScrollView()
        scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
        ])
        if let incoming { receive(incoming) }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        checkSetupReturn()
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        checkSetupReturn()
    }

    func checkSetupReturn() {
        guard let attempt = preparation, activityController != nil else { return }
        // ReplayKit normally delivers its delegate result as setup closes. Do not
        // leave the host looking idle if the sheet closes without that result.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.preparation == attempt,
                  self.presentedViewController == nil,
                  self.activityController?.presentingViewController == nil else { return }
            self.finishPreparation()
            self.showError("iOS cerró la configuración sin entregar el controlador de transmisión. La pantalla de configuración se abrió, pero ReplayKit no completó el retorno. Indica este mensaje y la versión de iOS que aparece abajo.")
        }
    }

    private func configure(_ button: UIButton, title: String, action: Selector, primary: Bool = false) {
        var configuration = primary ? UIButton.Configuration.filled() : .tinted()
        configuration.title = title
        configuration.titleAlignment = .center
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 12, bottom: 13, trailing: 12)
        button.configuration = configuration
        button.titleLabel?.numberOfLines = 0
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func button(_ title: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        configure(button, title: title, action: action)
        return button
    }

    private func showStatus(_ message: String) {
        status.text = message
        status.textColor = .secondaryLabel
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private func showError(_ message: String, error: Error? = nil) {
        view.endEditing(true)
        let detail = error.map { "\nCódigo de iOS: \(($0 as NSError).domain.prefix(80)) / \(($0 as NSError).code)" } ?? ""
        let text = message + detail
        status.text = text
        status.textColor = .systemRed
        guard presentedViewController == nil, view.window != nil,
              UIApplication.shared.applicationState == .active else { return }
        let alert = UIAlertController(title: "Pulso Screen", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Entendido", style: .default))
        present(alert, animated: true)
    }

    private func finishPreparation() {
        preparation = nil
        preparationTimeout?.cancel()
        preparationTimeout = nil
        activityController?.delegate = nil
        activityController = nil
        prepareButton.isEnabled = true
        var configuration = prepareButton.configuration
        configuration?.title = "Copiar enlace y preparar transmisión"
        prepareButton.configuration = configuration
    }

    @objc private func closeKeyboard() { view.endEditing(true) }

    func receive(_ url: URL) {
        guard isViewLoaded else { incoming = url; return }
        do {
            linkField.text = try PairingLink(url.absoluteString).webURL.absoluteString
            showStatus("Enlace recibido. Pulsa Copiar enlace y preparar transmisión.")
        } catch { showError(error.localizedDescription) }
    }

    @objc private func pasteLink() {
        view.endEditing(true)
        guard let value = UIPasteboard.general.string else {
            showError("No hay un enlace copiado. En Safari, pulsa Copiar enlace de emparejamiento y vuelve a esta app.")
            return
        }
        do {
            linkField.text = try PairingLink(value).webURL.absoluteString
            showStatus("Enlace pegado. Ahora pulsa Copiar enlace y preparar transmisión.")
        } catch { showError(error.localizedDescription) }
    }

    private func checkInstalledExtensions() throws {
        guard let directory = Bundle.main.builtInPlugInsURL,
              let urls = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            throw ScreenError.message("No se encuentran las extensiones. Reinstala el IPA conservando ambas extensiones en el instalador.")
        }
        let manifests = urls.filter { $0.pathExtension == "appex" }.compactMap { Bundle(url: $0)?.infoDictionary }
        try BroadcastInstallation.validate(manifests)
    }

    @objc private func startBroadcast() {
        guard preparation == nil, broadcast == nil else { return }
        view.endEditing(true)
        do {
            let link = try PairingLink(linkField.text)
            try checkInstalledExtensions()
            UIPasteboard.general.string = link.webURL.absoluteString
        } catch { showError(error.localizedDescription); return }
        RPScreenRecorder.shared().isCameraEnabled = false
        RPScreenRecorder.shared().isMicrophoneEnabled = false
        let attempt = UUID()
        preparation = attempt
        prepareButton.isEnabled = false
        var configuration = prepareButton.configuration
        configuration?.title = "Abriendo selector de iOS…"
        prepareButton.configuration = configuration
        showStatus("Esperando el selector de transmisión de iOS…")
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.preparation == attempt else { return }
            self.finishPreparation()
            self.showError("iOS no respondió al preparar la transmisión. Cierra la app y vuelve a abrirla. Si se repite, indica la versión de iOS y este mensaje; no hace falta compartir el enlace privado.")
        }
        preparationTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
        // setupInfo passes the pairing to the upload extension without App Groups.
        RPBroadcastActivityViewController.load { [weak self] controller, error in
            DispatchQueue.main.async {
                guard let self, self.preparation == attempt else { return }
                self.preparationTimeout?.cancel()
                self.preparationTimeout = nil
                guard error == nil, let controller else {
                    self.finishPreparation()
                    self.showError("iOS no pudo abrir el selector. Las extensiones están presentes, pero falta comprobar que iOS las haya registrado correctamente.", error: error)
                    return
                }
                self.activityController = controller
                controller.delegate = self
                self.showStatus("Confirma el monitor en la pantalla de iOS. Al volver, Pulso iniciará la transmisión.")
                if let popover = controller.popoverPresentationController {
                    popover.sourceView = self.view
                    popover.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
                }
                self.present(controller, animated: true)
                controller.presentationController?.delegate = self
            }
        }
    }

    func broadcastActivityViewController(_ broadcastActivityViewController: RPBroadcastActivityViewController, didFinishWith broadcastController: RPBroadcastController?, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.activityController === broadcastActivityViewController else { return }
            self.finishPreparation()
            // Starting must not depend on a dismissal animation completion:
            // ReplayKit can have already dismissed its setup UI at this point.
            if broadcastActivityViewController.presentingViewController != nil {
                broadcastActivityViewController.dismiss(animated: true)
            }
            guard error == nil, let broadcastController else {
                if let error { self.showError("No se pudo configurar la transmisión.", error: error) }
                else { self.showStatus("Transmisión cancelada. Puedes volver a prepararla.") }
                return
            }
            self.broadcast = broadcastController
            broadcastController.delegate = self
            self.prepareButton.isEnabled = false
            self.showStatus("Iniciando transmisión…")
            let timeout = DispatchWorkItem { [weak self] in
                guard let self, self.broadcast === broadcastController else { return }
                self.showError("iOS recibió la configuración, pero no confirmó el inicio de la transmisión. Pulsa Terminar transmisión antes de reintentar e indica este mensaje junto con la versión de iOS.")
            }
            self.broadcastTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
            broadcastController.startBroadcast { [weak self] error in
                DispatchQueue.main.async {
                    guard let self, self.broadcast === broadcastController else { return }
                    self.broadcastTimeout?.cancel()
                    self.broadcastTimeout = nil
                    if let error {
                        self.clearBroadcast()
                        self.showError("iOS no pudo iniciar la transmisión.", error: error)
                    }
                    else { self.showStatus("Transmisión iniciada. Espera a ver la imagen en Windows y después abre Cámara. Si se corta al cambiar de app, necesitamos comprobar la compatibilidad con tu iOS.") }
                }
            }
        }
    }

    private func clearBroadcast() {
        broadcastTimeout?.cancel()
        broadcastTimeout = nil
        broadcast?.delegate = nil
        broadcast = nil
        prepareButton.isEnabled = true
    }

    func broadcastController(_ broadcastController: RPBroadcastController, didFinishWithError error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.broadcast === broadcastController else { return }
            self.clearBroadcast()
            if let error { self.showError("La extensión de transmisión se detuvo.", error: error) }
            else { self.showStatus("La transmisión ha terminado.") }
        }
    }

    @objc private func stopBroadcast() {
        activityController?.dismiss(animated: true)
        finishPreparation()
        guard let broadcast else { showStatus("No hay una transmisión iniciada desde esta app."); return }
        prepareButton.isEnabled = false
        broadcast.finishBroadcast { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.broadcast === broadcast else { return }
                if let error { self.showError("No se pudo terminar la transmisión.", error: error) }
                else {
                    self.clearBroadcast()
                    self.showStatus("Transmisión finalizada.")
                }
            }
        }
    }

}
