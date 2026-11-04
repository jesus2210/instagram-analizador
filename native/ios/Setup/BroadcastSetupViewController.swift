import UIKit
import ReplayKit

final class BroadcastSetupViewController: UIViewController {
    private let field = UITextView()
    private let status = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let title = UILabel()
        title.text = "Conectar Pulso Screen"
        title.font = .systemFont(ofSize: 24, weight: .bold)
        let instructions = UILabel()
        instructions.text = "Pega el enlace temporal de Pulso. Al continuar, iOS enviará toda la pantalla al monitor emparejado, sin audio. Podrás detenerla desde el indicador de transmisión de iOS."
        instructions.numberOfLines = 0
        field.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.backgroundColor = .secondarySystemBackground
        field.heightAnchor.constraint(equalToConstant: 110).isActive = true
        field.accessibilityLabel = "Enlace de Pulso"
        let paste = UIButton(type: .system)
        paste.setTitle("Pegar enlace", for: .normal)
        paste.addTarget(self, action: #selector(pasteLink), for: .touchUpInside)
        let done = UIButton(type: .system)
        done.setTitle("Confirmar monitor y continuar", for: .normal)
        done.addTarget(self, action: #selector(complete), for: .touchUpInside)
        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancelar", for: .normal)
        cancel.addTarget(self, action: #selector(cancelSetup), for: .touchUpInside)
        status.numberOfLines = 0
        let stack = UIStackView(arrangedSubviews: [title, instructions, field, paste, done, cancel, status])
        stack.axis = .vertical
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24)
        ])
    }

    @objc private func pasteLink() {
        // User-initiated paste in a visible setup UI, never from the background uploader.
        guard let value = UIPasteboard.general.string else {
            status.text = "No hay un enlace copiado. Vuelve a Pulso Screen y copia el del QR."
            return
        }
        field.text = value
    }

    @objc private func complete() {
        do {
            let pairing = try PairingLink(field.text)
            extensionContext?.completeRequest(withBroadcast: PairingLink.baseURL, setupInfo: ["pairingURL": pairing.webURL.absoluteString as NSString])
        } catch { status.text = error.localizedDescription }
    }

    @objc private func cancelSetup() {
        extensionContext?.cancelRequest(withError: ScreenError.message("Transmisión cancelada."))
    }
}
