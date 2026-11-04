import UIKit
import ReplayKit

final class BroadcastSetupViewController: UIViewController {
    private let field = UITextView()
    private let status = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        view.tintColor = .systemBlue
        let title = UILabel()
        title.text = "Conectar Pulso Screen"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textColor = .label
        title.numberOfLines = 0
        title.adjustsFontForContentSizeCategory = true
        let instructions = UILabel()
        instructions.text = "Pega el enlace temporal y confirma el monitor. Se enviará toda la pantalla a Windows, sin audio."
        instructions.numberOfLines = 0
        instructions.font = .preferredFont(forTextStyle: .body)
        instructions.textColor = .secondaryLabel
        instructions.adjustsFontForContentSizeCategory = true
        field.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        field.textColor = .label
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.keyboardType = .URL
        field.backgroundColor = .secondarySystemBackground
        field.layer.cornerRadius = 12
        // The link only arrives through "Pegar enlace". A read-only field never
        // opens the keyboard, which used to cover the confirm button.
        field.isEditable = false
        field.isSelectable = false
        field.heightAnchor.constraint(equalToConstant: 70).isActive = true
        field.accessibilityLabel = "Enlace de Pulso"
        let paste = button("Pegar enlace", action: #selector(pasteLink))
        let done = button("Confirmar monitor y continuar", action: #selector(complete), primary: true)
        let cancel = button("Cancelar", action: #selector(cancelSetup))
        status.numberOfLines = 0
        status.font = .preferredFont(forTextStyle: .callout)
        status.textColor = .secondaryLabel
        status.adjustsFontForContentSizeCategory = true
        status.text = "Falta pegar el enlace del monitor."
        // Action buttons first so nothing important can fall below the sheet.
        let stack = UIStackView(arrangedSubviews: [title, status, paste, done, field, cancel, instructions])
        stack.axis = .vertical
        stack.spacing = 16
        let scroll = UIScrollView()
        scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
        ])
    }

    private func button(_ title: String, action: Selector, primary: Bool = false) -> UIButton {
        let button = UIButton(type: .system)
        var configuration = primary ? UIButton.Configuration.filled() : .tinted()
        configuration.title = title
        configuration.titleAlignment = .center
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 12, bottom: 13, trailing: 12)
        button.configuration = configuration
        button.titleLabel?.numberOfLines = 0
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    @objc private func closeKeyboard() { view.endEditing(true) }

    private func showError(_ message: String) {
        view.endEditing(true)
        status.text = message
        status.textColor = .systemRed
        guard presentedViewController == nil, view.window != nil else { return }
        let alert = UIAlertController(title: "Configuración de Pulso", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Entendido", style: .default))
        present(alert, animated: true)
    }

    @objc private func pasteLink() {
        view.endEditing(true)
        guard let value = UIPasteboard.general.string else {
            showError("No hay un enlace copiado. Vuelve a Pulso Screen y copia el del QR.")
            return
        }
        do {
            field.text = try PairingLink(value).webURL.absoluteString
            status.text = "Enlace pegado. Iniciando la transmisión…"
            status.textColor = .secondaryLabel
            // Continue by itself; the confirm button stays as a fallback.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                guard let self, !self.field.text.isEmpty else { return }
                self.complete()
            }
        } catch { showError(error.localizedDescription) }
    }

    @objc private func complete() {
        view.endEditing(true)
        do {
            let pairing = try PairingLink(field.text)
            guard let context = extensionContext else {
                showError("iOS no proporcionó una sesión de configuración. Cancela y vuelve a preparar la transmisión desde Pulso Screen.")
                return
            }
            context.completeRequest(withBroadcast: PairingLink.baseURL, setupInfo: ["pairingURL": pairing.webURL.absoluteString as NSString])
        } catch { showError(error.localizedDescription) }
    }

    @objc private func cancelSetup() {
        extensionContext?.cancelRequest(withError: ScreenError.message("Transmisión cancelada."))
    }
}
