import UIKit
import ReplayKit

final class ScreenViewController: UIViewController, RPBroadcastActivityViewControllerDelegate {
    private let linkField = UITextView()
    private let status = UILabel()
    private let prepareButton = UIButton(type: .system)
    private var broadcast: RPBroadcastController?
    private var incoming: URL?
    private var preparation: UUID?
    private var preparationTimeout: DispatchWorkItem?

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
        let stack = UIStackView(arrangedSubviews: [title, status, instructions, linkField, paste, prepareButton, stop])
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
        guard preparation == nil else { return }
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
                self.finishPreparation()
                guard error == nil, let controller else {
                    self.showError("iOS no pudo abrir el selector. Las extensiones están presentes, pero falta comprobar que iOS las haya registrado correctamente.", error: error)
                    return
                }
                controller.delegate = self
                if let popover = controller.popoverPresentationController {
                    popover.sourceView = self.view
                    popover.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
                }
                self.present(controller, animated: true)
            }
        }
    }

    func broadcastActivityViewController(_ broadcastActivityViewController: RPBroadcastActivityViewController, didFinishWith broadcastController: RPBroadcastController?, error: Error?) {
        broadcastActivityViewController.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            guard error == nil, let broadcastController else {
                if let error { self.showError("No se pudo configurar la transmisión.", error: error) }
                else { self.showStatus("Transmisión cancelada. Puedes volver a prepararla.") }
                return
            }
            self.broadcast = broadcastController
            self.showStatus("Iniciando transmisión…")
            broadcastController.startBroadcast { [weak self] error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if let error { self.showError("iOS no pudo iniciar la transmisión.", error: error) }
                    else { self.showStatus("Transmisión iniciada. Espera a ver la imagen en Windows y después abre Cámara. Si se corta al cambiar de app, necesitamos comprobar la compatibilidad con tu iOS.") }
                }
            }
        }
    }

    @objc private func stopBroadcast() {
        finishPreparation()
        guard let broadcast else { showStatus("No hay una transmisión iniciada desde esta app."); return }
        broadcast.finishBroadcast { [weak self] error in
            DispatchQueue.main.async {
                if let error { self?.showError("No se pudo terminar la transmisión.", error: error) }
                else { self?.showStatus("Transmisión finalizada.") }
            }
        }
    }

}
