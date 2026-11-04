# Pulso Screen · prototipo iOS para el monitor de Windows

Este proyecto intenta transmitir la pantalla del iPhone a Pulso mientras usas **Cámara de Apple**. Usa ReplayKit y WebRTC; no abre una cámara propia ni solicita micrófono. No requiere App Groups, Associated Domains, notificaciones push, certificados de distribución ni una cuenta Apple dentro del código.

**Estado real:** el primer intento real en GitHub alcanzó la compilación con Xcode 26.6 y resolvió WebRTC, pero falló por asignar un códec opcional a una propiedad no opcional. Se corrigió esa asignación y una lectura prematura de propiedades durante la inicialización Swift; la siguiente compilación completa sigue pendiente. No existe aún un IPA validado ni una prueba de instalación en iPhone. Este entorno Linux no dispone de Xcode. La prueba del propietario confirma que la grabación de pantalla muestra Cámara, pero no demuestra que una transmisión ReplayKit siga funcionando al cambiar de app o al grabar vídeo. Tampoco demuestra que su instalador gratuito conserve correctamente las extensiones. Esos puntos se prueban con el primer IPA; no se promete una app terminada.

## Antes de generar el IPA

- El monitor web debe estar desplegado con el modo **Pantalla del iPhone (app propia)** y la ruta `/screen`. Tener el código en GitHub no publica ese monitor. La publicación web seguía pendiente del acceso a Vercel cuando se preparó este prototipo.
- Necesitas Windows, cable USB e iPhone con iOS 18 o posterior. El objetivo de la primera prueba es el iPhone Air del propietario con su iOS actual; no se ha validado todo el rango de versiones.
- Revisa que GitHub Actions esté habilitado y que tu cuenta disponga de minutos de macOS incluidos. El workflow es **solo manual**, usa un runner estándar y no activa planes, compras ni facturación. **No lo ejecutes si GitHub avisa de cargos o no tienes cuota gratuita.** Se limita a 25 minutos y conserva el artefacto tres días.
- Apple puede imponer límites a la firma gratuita. Renovarla semanalmente es solo una parte: la primera firma, la instalación de las dos extensiones y el funcionamiento de ReplayKit también deben verificarse. No compres una cuenta de desarrollador para esta prueba.

## Generar desde GitHub, sin tener un Mac

1. Abre el repositorio `jesus2210/instagram-analizador` en GitHub y entra en **Actions**.
2. Elige **Build Pulso Screen (unsigned)** y ejecuta **Run workflow** sobre `main`, después de comprobar la cuota.
3. Cuando termine correctamente, descarga el artefacto **PulsoScreen-unsigned**.
4. Extrae `PulsoScreen-unsigned.ipa`, `SHA256SUMS.txt` y la guía. El IPA **todavía no está firmado y no se instala abriéndolo directamente**.
5. Opcionalmente comprueba el archivo con PowerShell: `Get-FileHash .\PulsoScreen-unsigned.ipa -Algorithm SHA256`, comparándolo con `SHA256SUMS.txt`.

Después de una corrección en el código, usa **Run workflow** sobre `main` para crear una ejecución nueva. **Re-run jobs** de una ejecución antigua reutiliza su commit anterior. Si el workflow falla, conserva el mensaje del primer paso que falla. Ahora también se sube el artefacto pequeño `PulsoScreen-build-logs` con los logs disponibles de resolución y compilación; el código de salida de Xcode se conserva aunque se guarden los logs. No hay un IPA válido hasta que Xcode termine el archivo y se hayan comprobado ambas extensiones. No se deben omitir los errores de compilación ni las verificaciones de SwiftPM para obtener un archivo aparentemente listo.

El workflow compila con Xcode en macOS. WebRTC se fija en `156.0.0`, commit `3cc466ea040e5dcd1344697bf211dc4c079d1a0c`; el paquete verifica el checksum de su XCFramework. No necesita claves de firma ni credenciales Apple en GitHub. XcodeGen genera un proyecto con app, extensión de configuración y extensión de subida. Las APIs de ReplayKit utilizadas requieren una comprobación de compatibilidad con el iOS concreto; algunas están deprecadas en SDK posteriores.

## Primera instalación gratuita desde Windows

Una opción a evaluar es la instalación local con [Sideloadly](https://sideloadly.io/), usando sus funciones gratuitas. Su compatibilidad y pantallas pueden cambiar; no se ha probado aquí. Otra opción es un instalador compatible con IPA y extensiones que admita tu cuenta gratuita de Apple.

1. Descarga el instalador exclusivamente de su sitio oficial. Instala los componentes de Apple para Windows que indique su documentación y conecta el iPhone por USB.
2. Desbloquea el teléfono y confirma **Confiar en este ordenador** cuando iOS lo solicite.
3. Selecciona el IPA y utiliza tu cuenta Apple **solo en el instalador local**. No compartas contraseña, códigos 2FA ni certificados por chat, GitHub o Pulso.
4. Conserva **las dos extensiones** (`.broadcast` y `.setup`) y sus identificadores coherentes con el de la app. Si el instalador ofrece eliminarlas, no lo hagas. El build usa `dev.pulso.<propietario-del-repositorio>.screen`; evita cambiar de identificadores en cada renovación.
5. Completa las opciones de confianza y Modo desarrollador que solicite iOS. Su ubicación puede variar por versión; sigue el mensaje del propio teléfono.
6. Comprueba que aparece Pulso Screen y que iOS ofrece el servicio Pulso Screen al preparar la transmisión.

**Detente si pide pagar por una capacidad, si rechaza ReplayKit con tu cuenta gratuita o si elimina/rompe las extensiones.** La app no declara App Groups para evitar depender de esa capacidad, pero eso no garantiza que todos los instaladores o perfiles gratuitos acepten este prototipo. Comunica el error concreto antes de cambiar de plan.

Para renovar, vuelve a firmar e instalar el mismo IPA con la misma cuenta y los mismos identificadores antes de la caducidad que muestre el instalador. No necesitas recompilarlo cada semana mientras el código no cambie. Puede ser necesario volver a emparejar; no se conservan claves de conexión entre sesiones.

## Primera transmisión

1. Conecta iPhone y Windows a la misma Wi-Fi, sin red de invitados ni VPN. Permite la red local si iOS la solicita.
2. En Pulso de Windows abre **Monitor de cámara → Pantalla del iPhone (app propia)** y genera un QR.
3. Escanéalo. La página `/screen` ofrece **Abrir Pulso Screen** y copiar el enlace; si la app no está instalada, primero completa su instalación.
4. En la app pulsa **Copiar enlace y preparar transmisión**. Elige el servicio **Pulso Screen** en el selector de iOS.
5. En su configuración visible, pulsa **Pegar enlace** y **Confirmar monitor y continuar**. El sistema entrega ese enlace temporal a la extensión de subida mediante `setupInfo`, sin App Groups ni lectura de portapapeles en segundo plano.
6. Confirma los diálogos de iOS y deja desactivado el micrófono de la transmisión de pantalla; Cámara gestionará su audio. Espera a ver la imagen de Pulso Screen en Windows **antes** de abrir Cámara de Apple.
7. Abre Cámara, comprueba que la imagen cambia en Windows y haz una grabación corta. Graba y detén desde Cámara; el monitor no controla los botones de esa app. El vídeo final queda en Fotos.
8. Detén la transmisión desde el indicador de iOS, desde Pulso Screen o desde Terminar sesión en Windows.

El inicio directo desde el Centro de control sin configuración previa no dispone de enlace; el prototipo debe rechazarlo con un mensaje para emparejar de nuevo. Se usa el flujo de configuración de ReplayKit, cuya continuidad al abandonar la app debe validarse en el dispositivo. Si al abrir Cámara se corta, aparece negro, se cierra la extensión o iOS detiene la grabación, detén la prueba y comunica lo ocurrido. No se considera validada por mostrar únicamente la pantalla inicial de Pulso Screen.

## Límites y privacidad

- Transmite **toda la pantalla**, no solo el visor de Cámara. No envía audio del sistema ni del micrófono; los buffers de audio se descartan. Cámara gestiona su grabación de sonido por separado.
- El vídeo viaja por WebRTC cifrado; no se almacena ni pasa por OpenAI. Se reutiliza el emparejamiento temporal del servidor existente, con QR de cinco minutos y claves separadas por rol. El monitor borra los datos de emparejamiento tras confirmar la conexión.
- El código acepta únicamente enlaces de la dirección oficial de Pulso o el esquema local `pulsoscreen://pair`. El servidor de destino está fijado; un QR no puede elegir un servidor arbitrario. No se registran claves, SDP ni fotogramas en logs.
- Se solicita un máximo aproximado de 720 × 1280, 15 fps y 2 Mbit/s para el **monitor**, sin alterar los ajustes de grabación de Cámara. El sistema puede limitar calidad o recursos. Las extensiones ReplayKit tienen restricciones estrictas de memoria; hay que observar su estabilidad real.
- No hay un servidor TURN contratado: algunas redes no permiten conexión directa. El STUN público de Cloudflare ayuda a encontrar la ruta y no recibe los fotogramas.
- El flujo necesita transmisión y teléfono activos. No ofrece recuperación ni reanudación tras cerrar la app; genera un QR nuevo.

## Desarrollo con un Mac disponible

Instala Xcode y XcodeGen, y ejecuta `bash native/ios/build-unsigned.sh` desde el repositorio. El script rechaza Linux, usa verificación normal de SwiftPM, genera el proyecto e incluye ambas extensiones en el IPA. Para probar el parser independiente: `swiftc native/ios/Shared/PairingLink.swift native/ios/Validation/main.swift -o /tmp/pulso-pairing-tests` y ejecuta ese binario.

El código Swift no se ha compilado en este entorno Linux. Las pruebas Node y de navegador validan el protocolo y la web, **no sustituyen** Xcode, la firma ni la prueba física de ReplayKit.

### Corrección de empaquetado de WebRTC

El segundo fallo comunicado ocurrió al copiar el producto `WebRTC` como si fuera un archivo, sin `.framework`. El proyecto ahora enlaza el producto WebRTC mediante SwiftPM y desactiva la copia explícita de XcodeGen en ambos targets; Xcode gestiona el XCFramework binario. No se cambió la versión ni se desactivó la verificación del paquete. Antes de crear el IPA se exige que exista `Frameworks/WebRTC.framework/WebRTC` dentro de la app archivada, además de ambas extensiones. La comprobación evita distribuir una app incompleta, pero el resultado real debe confirmarse con una ejecución nueva de GitHub sobre el último commit de `main`.
