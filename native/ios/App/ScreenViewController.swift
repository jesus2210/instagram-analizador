import UIKit
import ReplayKit
import Network

final class ScreenViewController: UIViewController {
    private let linkField = UITextView()
    private let status = UILabel()
    private let prepareButton = UIButton(type: .system)
    private let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
    private var incoming: URL?
    private var localNetworkProbe: NWBrowser?

    /// The upload extension cannot show the Local Network prompt. Browsing for a
    /// Bonjour service from the host app makes iOS ask for it here, once.
    private func requestLocalNetworkAccess() {
        guard localNetworkProbe == nil else { return }
        let browser = NWBrowser(for: .bonjour(type: "_pulso._tcp", domain: nil), using: .tcp)
        browser.stateUpdateHandler = { _ in }
        browser.browseResultsChangedHandler = { _, _ in }
        browser.start(queue: .main)
        localNetworkProbe = browser
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            self?.localNetworkProbe?.cancel()
        }
    }

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
        instructions.text = "1. Genera un QR de pantalla en Pulso desde Windows.\n2. Abre el enlace en el iPhone y pégalo aquí.\n3. Pulsa Preparar transmisión y, en la hoja de iOS, elige Pulso Screen y Iniciar emisión.\n4. Cuando Windows muestre la imagen, abre Cámara.\n\nCompartes toda la pantalla, sin audio. Para parar, toca el indicador rojo de iOS."
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
        configure(prepareButton, title: "Preparar transmisión", action: #selector(startBroadcast), primary: true)
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
        let stack = UIStackView(arrangedSubviews: [title, status, instructions, linkField, paste, prepareButton, version])
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
        // The system picker must be in the view hierarchy to be triggered; it stays invisible.
        picker.showsMicrophoneButton = false
        picker.alpha = 0.011
        picker.isAccessibilityElement = false
        picker.frame = CGRect(x: 0, y: 0, width: 44, height: 44)
        view.addSubview(picker)
        if let incoming { receive(incoming) }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        requestLocalNetworkAccess()
    }

    /// Kept for the app delegate; the system picker needs no return handling.
    func checkSetupReturn() {}

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

    private func showError(_ message: String) {
        view.endEditing(true)
        status.text = message
        status.textColor = .systemRed
        guard presentedViewController == nil, view.window != nil,
              UIApplication.shared.applicationState == .active else { return }
        let alert = UIAlertController(title: "Pulso Screen", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Entendido", style: .default))
        present(alert, animated: true)
    }

    @objc private func closeKeyboard() { view.endEditing(true) }

    func receive(_ url: URL) {
        guard isViewLoaded else { incoming = url; return }
        do {
            linkField.text = try PairingLink(url.absoluteString).webURL.absoluteString
            showStatus("Enlace recibido. Pulsa Preparar transmisión.")
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
            showStatus("Enlace pegado. Ahora pulsa Preparar transmisión.")
        } catch { showError(error.localizedDescription) }
    }

    /// Returns the installed upload extension's bundle identifier after checking both extensions.
    private func installedUploadID() throws -> String {
        guard let directory = Bundle.main.builtInPlugInsURL,
              let urls = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            throw ScreenError.message("No se encuentran las extensiones. Reinstala el IPA conservando ambas extensiones en el instalador.")
        }
        let manifests = urls.filter { $0.pathExtension == "appex" }.compactMap { Bundle(url: $0)?.infoDictionary }
        try BroadcastInstallation.validate(manifests)
        guard let upload = manifests.first(where: {
            (($0["NSExtension"] as? [String: Any])?["NSExtensionPointIdentifier"] as? String) == BroadcastInstallation.uploadPoint
        }), let identifier = upload["CFBundleIdentifier"] as? String else {
            throw ScreenError.message("No se encuentra la extensión de transmisión.")
        }
        return identifier
    }

    @objc private func startBroadcast() {
        view.endEditing(true)
        let link: PairingLink
        let uploadID: String
        do {
            link = try PairingLink(linkField.text)
            uploadID = try installedUploadID()
        } catch { showError(error.localizedDescription); return }
        prepareButton.isEnabled = false
        showStatus("Preparando el emparejamiento…")
        PairingHandoff.offer(link) { [weak self] error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.prepareButton.isEnabled = true
                if let error { self.showError(error.localizedDescription); return }
                self.showStatus("Emparejamiento listo. En la hoja de iOS elige Pulso Screen y pulsa Iniciar emisión. Espera a ver la imagen en Windows antes de abrir Cámara.")
                self.presentPicker(uploadID)
            }
        }
    }

    private func presentPicker(_ uploadID: String) {
        picker.preferredExtension = uploadID
        picker.showsMicrophoneButton = false
        // The picker is a view wrapping a button; activating it opens the system sheet.
        for subview in picker.subviews {
            if let trigger = subview as? UIButton { trigger.sendActions(for: .touchUpInside) }
        }
    }
}
