import UIKit
import ReplayKit

final class ScreenViewController: UIViewController, RPBroadcastActivityViewControllerDelegate {
    private let linkField = UITextView()
    private let status = UILabel()
    private var broadcast: RPBroadcastController?
    private var incoming: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 0.95, alpha: 1)
        let title = UILabel()
        title.text = "Pulso Screen"
        title.font = .systemFont(ofSize: 32, weight: .bold)
        let instructions = UILabel()
        instructions.numberOfLines = 0
        instructions.text = "Prototipo de transmisión de pantalla.\n\n1. En Windows abre Pulso → Monitor → Pantalla del iPhone y genera un QR.\n2. Abre el enlace en este iPhone y cópialo aquí.\n3. Copia y prepara la transmisión. En la configuración de Pulso Screen, pega el mismo enlace y confirma.\n4. Cuando Windows reciba la imagen, abre Cámara y graba como siempre.\n\nCompartes toda la pantalla. El monitor no recibe audio ni guarda el vídeo."
        instructions.font = .systemFont(ofSize: 15)
        linkField.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        linkField.backgroundColor = .white
        linkField.layer.cornerRadius = 12
        linkField.autocorrectionType = .no
        linkField.autocapitalizationType = .none
        linkField.heightAnchor.constraint(equalToConstant: 95).isActive = true
        linkField.accessibilityLabel = "Enlace privado de emparejamiento"
        let paste = button("Pegar enlace", action: #selector(pasteLink))
        let start = button("Copiar enlace y preparar transmisión", action: #selector(startBroadcast))
        let stop = button("Terminar transmisión", action: #selector(stopBroadcast))
        status.numberOfLines = 0
        status.font = .systemFont(ofSize: 14)
        status.text = "No se inicia ninguna transmisión hasta que la confirmes en iOS."
        let stack = UIStackView(arrangedSubviews: [title, instructions, linkField, paste, start, stop, status])
        stack.axis = .vertical
        stack.spacing = 17
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
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

    private func button(_ title: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.numberOfLines = 0
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    func receive(_ url: URL) {
        guard isViewLoaded else { incoming = url; return }
        do {
            linkField.text = try PairingLink(url.absoluteString).webURL.absoluteString
            status.text = "Enlace recibido. Confirma la transmisión para conectar con tu laptop."
        } catch { status.text = error.localizedDescription }
    }

    @objc private func pasteLink() {
        guard let value = UIPasteboard.general.string else {
            status.text = "Copia primero el enlace desde el QR de Pulso."
            return
        }
        do { linkField.text = try PairingLink(value).webURL.absoluteString }
        catch { status.text = error.localizedDescription }
    }

    @objc private func startBroadcast() {
        do {
            let link = try PairingLink(linkField.text)
            UIPasteboard.general.string = link.webURL.absoluteString
        } catch { status.text = error.localizedDescription; return }
        view.endEditing(true)
        // ReplayKit's setup extension passes setupInfo directly to the upload extension.
        // No App Groups, shared keychain entitlement or background clipboard access is needed.
        RPBroadcastActivityViewController.load { [weak self] controller, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard error == nil, let controller else {
                    self.status.text = "iOS no pudo abrir los servicios de transmisión. Comprueba que las dos extensiones de Pulso Screen se instalaron."
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
        broadcastActivityViewController.dismiss(animated: true)
        guard error == nil, let broadcastController else {
            status.text = "Transmisión cancelada o servicio no disponible."
            return
        }
        broadcast = broadcastController
        broadcastController.startBroadcast { [weak self] error in
            DispatchQueue.main.async {
                self?.status.text = error == nil
                    ? "Transmisión iniciada. Espera a ver la imagen en Windows; después abre Cámara. Si al salir de Pulso se interrumpe, detén la prueba y comunícalo: esta ruta requiere validación en tu iOS."
                    : "No se pudo iniciar. Genera otro QR y vuelve a emparejar."
            }
        }
    }

    @objc private func stopBroadcast() {
        broadcast?.finishBroadcast { [weak self] _ in
            DispatchQueue.main.async { self?.status.text = "Transmisión finalizada." }
        }
    }
}
