# Pulso · Radar de nutrición y fitness

Aplicación propia para estudiar contenido público de competidores, desarrollar guiones con referencias y contrastar las ideas con tus resultados.

## Estado

El propietario confirmó que la conexión de Instagram funciona en la versión publicada en https://instagram-analizador.vercel.app. Esta ampliación incorpora análisis avanzado, espacio persistente, estudio creativo y resultados propios. La validación local usa respuestas simuladas para Meta/OpenAI; no demuestra el funcionamiento real de los nuevos endpoints con la cuenta del propietario. La ampliación se publicó en producción como `dpl_9HDtpnFEjAfdaxoufCppH5JAyLn2`. Se verificaron HTTP 200 en la página, el JS actual y la salud con Redis, y HTTP 401 sin sesión en el espacio privado y sin credencial en el cron. `CRON_SECRET` está configurado; el seguimiento sigue siendo optativo desde la interfaz. `OPENAI_API_KEY` aún no está configurada en Production, por lo que la IA permanece desactivada. Las nuevas consultas autenticadas de resultados propios requieren validación del propietario.

## Desarrollo

Node.js 22 o posterior (comprobado con 24.19.0).

```sh
npm ci
npm run dev
```

Vite sirve el cliente en 5173 y Express la API en 3001. Sin credenciales se puede explorar una muestra ficticia e ideas editoriales locales. Las fuentes se sirven desde la aplicación.

```sh
npm test
npm run test:browser
npm run build
npm start
```

Los tests de navegador usan `/usr/bin/chromium`, o `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. La prueba de extracción de audio genera un vídeo sintético con ffmpeg y se omite si no está instalado. Los tests no gastan crédito de OpenAI ni autorizan una cuenta real de Meta.

## Configuración privada

Copia `.env.example` a un nuevo `.env` solo para desarrollo local, o introduce las variables directamente en Vercel. Nunca pegues claves en el chat, código, navegador ni Git.

| Variable | Uso |
| --- | --- |
| `APP_URL` | Origen HTTPS estable; producción: `https://instagram-analizador.vercel.app` |
| `META_APP_ID`, `META_APP_SECRET` | App de Meta con Instagram API with Facebook Login |
| `META_LOGIN_CONFIG_ID` | Opcional, configuración Business Login con token de **usuario** |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis REST conectado al proyecto; alternativamente `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` |
| `OPENAI_API_KEY` | Activa guiones, revisión de transcripciones y vídeo; solo en el servidor |
| `OPENAI_MODEL` | Opcional, modelo con visión y Structured Outputs; predeterminado `gpt-4o-mini` |
| `OPENAI_TRANSCRIPTION_MODEL` | Opcional; predeterminado `gpt-4o-mini-transcribe` |
| `CRON_SECRET` | Secreto aleatorio de al menos 32 bytes para autenticar el seguimiento programado |

La infraestructura existente usa Upstash `pulso-sesiones`, plan Free, región iad1, sin mejoras automáticas ni Prod Pack. No crear otra base por defecto. Las credenciales reales de Meta/Redis permanecen en Vercel; no se incluyen en esta entrega.

## Las seis mejoras

### 1. Rendimiento respecto a lo habitual

**Análisis avanzado** compara likes + comentarios con la mediana de otras publicaciones de la misma cuenta, formato y antigüedad (2–7, 8–30 y más de 30 días). Excluye la propia referencia de su mediana. Requiere cuatro referencias completas, mediana mayor que cero y una publicación de al menos 48 horas. Destaca multiplicadores desde 1,5× y muestra el tamaño de la muestra.

Es una comparación descriptiva de la muestra, no una predicción ni una prueba de causalidad. Las franjas no igualan exactamente las horas transcurridas; las publicaciones antiguas pueden haber acumulado más interacciones. El ratio público respecto a seguidores actuales se conserva en la biblioteca.

### 2. Patrones entre competidores

Agrupa temas detectados por palabras de la descripción. Calcula una mediana por creador y luego entre creadores, para no dar más peso a quien publica más. Distingue señales exploratorias de patrones observados en al menos tres publicaciones y dos cuentas. Enlaza referencias verificables. La clasificación temática actual es por reglas, no por lectura del vídeo.

### 3. Contenido del vídeo

**Estudio creativo → Analizar un vídeo** admite MP4/WebM de 1–180 segundos y hasta 100 MB, o una transcripción de 30–18.000 caracteres. El navegador reproduce el vídeo a velocidad normal para extraer audio comprimido y hasta tres fotogramas JPEG. Solo se envían ese audio (máximo 3 MB) y los fotogramas al servidor; el original permanece en el dispositivo. Requiere un navegador con AudioContext y MediaRecorder. La transcripción manual es la alternativa.

OpenAI transcribe el audio y analiza el texto y las imágenes parciales: gancho, estructura, texto visible, observaciones concretas, mejoras, limitaciones y adaptación propuesta. El texto sin vídeo no permite analizar imágenes. No se descarga automáticamente contenido de Instagram ni se conoce la retención real de un competidor. El audio y los fotogramas no se guardan en Redis; se conserva la transcripción y el análisis.

### 4. Guiones con referencias

El estudio guarda audiencia, objetivo y tono. La generación selecciona hasta ocho referencias con muestra comparable del espacio real y entrega título, gancho, guion, tomas, CTA, hipótesis y afirmaciones que requieren verificación. Valida que los IDs citados existan entre las referencias enviadas. Las descripciones externas se tratan como datos no fiables, nunca como instrucciones. Los borradores se pueden guardar y editar en **Mis ideas**.

La IA requiere `OPENAI_API_KEY`, cuenta con crédito del proveedor y un nuevo despliegue. Límite de **cinco solicitudes por espacio y día UTC**, incluidas solicitudes fallidas después de reservar el uso; una transcripción más su análisis cuentan como una solicitud de Pulso y pueden ser dos cargos del proveedor. No hay ejecución de IA en segundo plano. Las referencias, dirección editorial y resultados propios vinculados, o el material de vídeo que selecciones, se envían a OpenAI al pulsar Generar/Analizar. Los borradores no inventan fuentes científicas deliberadamente, pero requieren revisión humana; las instrucciones al modelo no garantizan exactitud.

### 5. Historial y seguimiento

Cada sincronización real registra hasta 50 publicaciones, seguidores actuales y métricas disponibles. Conserva hasta **90 mediciones diarias por cuenta** (la última de cada día UTC). Calcula cambios entre las últimas dos mediciones separadas al menos seis horas, solo con publicaciones presentes y completas en ambas. Mantiene valores negativos y no atribuye el cambio a nuevos posts fuera de la comparación. No reconstruye cifras anteriores al inicio del seguimiento.

`vercel.json` programa `/api/cron/track` a las **09:00 UTC**. Requiere Redis y `CRON_SECRET` en Production. El usuario debe activar **Seguimiento diario** en Análisis avanzado: se verifica la vigencia de la autorización y se conserva una credencial separada en el servidor hasta 60 días, limitada por la caducidad real del token y del acceso a datos. Después hay que reconectar y reactivar.

Hasta 20 competidores por espacio y 20 espacios con seguimiento por instalación. La tarea procesa espacios por turnos y deja de iniciar nuevos lotes a los 25 segundos para respetar el límite de 60 segundos de Vercel; si hay muchos espacios, algunos pueden quedar para otra ejecución. No garantiza frecuencia intradiaria ni una ejecución diaria por espacio bajo saturación. El alta puede necesitar la verificación/revisión de Meta según la cuenta. Los fallos quedan visibles en el espacio. Desactivar, vaciar o desconectar detiene la autorización de fondo. No se ejecuta IA desde el cron.

### 6. Tus resultados y aprendizaje

**Mi rendimiento** consulta hasta 50 publicaciones de tu cuenta conectada, alcance y cuentas que interactuaron en los últimos siete días. Consulta visualizaciones, guardados, compartidos e interacciones totales de hasta ocho publicaciones, priorizando las vinculadas a ideas. Meta puede no conceder métricas según permisos, formato o cuenta: se muestran como desconocidas, nunca se sustituyen por cero.

Vincula una idea guardada a una publicación real. El panel muestra su rendimiento respecto a tu muestra comparable y las métricas privadas disponibles. Los próximos guiones reciben estos experimentos vinculados como contexto. Esto aporta feedback a las recomendaciones; no entrena un modelo personalizado ni demuestra qué causó el resultado.

## Persistencia y privacidad

- La identidad del espacio es el Instagram seleccionado y verificado en el servidor; el cliente no elige el propietario de un endpoint.
- Redis existente guarda cuentas, publicaciones, hasta 100 ideas, 20 guiones, 10 análisis de vídeo e historial. Cada escritura renueva una caducidad de **180 días**; no es un archivo permanente. Límite aproximado: 1,8 MB por espacio.
- Escrituras con bloqueo y revisiones detectan conflictos entre dispositivos. Un fallo no se presenta como un guardado correcto.
- Los datos previos del navegador se respaldan localmente y las cuentas se vuelven a verificar con Meta al migrar. La copia anterior se puede exportar desde Datos y ajustes; las cuentas fallidas se notifican.
- La demostración permanece local. Exportar incluye el análisis y los resultados propios del espacio, nunca tokens ni CSRF. **Vaciar** borra los datos activos y detiene el seguimiento; la copia local anterior se conserva para recuperación.
- Las sesiones de usuario duran hasta ocho horas y se comparten entre instancias; una nueva sesión con el mismo Instagram recupera el espacio. En local sin Redis los datos del servidor se pierden al reiniciar.
- Tokens de Meta/OpenAI, respuestas de inspección y audio crudo no se envían al cliente ni se registran en logs. Cookies HttpOnly, SameSite=Lax y Secure en HTTPS; las mutaciones exigen CSRF.

## Conexión de Meta existente

Callback exacto: `https://instagram-analizador.vercel.app/api/instagram/callback`.

Scopes: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`. Una configuración Business Login debe usar token de usuario. El acceso externo puede requerir revisión de Meta. Si el rol de Página procede de Business Manager, la documentación de Business Discovery exige además `ads_read` o `ads_management`; no añadir permisos publicitarios si no aplica.

El propietario ya completó la selección de su Página y `jesus.nutricion.fit` y confirmó la conexión. No repetir comprobaciones ni crear más Páginas por defecto. El descubrimiento comprueba permisos granulares del token de esta misma app y verifica los objetos concedidos cuando `/me/accounts` queda vacío. `/api/instagram/status` sin cookies no informa de la sesión de otro navegador.

## Publicación

```sh
npx vercel login
npx vercel deploy --prod --scope ferrecontrol-s-projects
```

El proyecto enlazado es `instagram-analizador`. No crear un proyecto, base o plan nuevo por defecto. Cambiar variables exige un nuevo despliegue. Verifica el sitio, su JS actual y `/api/health` después de publicar; sin sesión, las rutas Pro deben rechazar el acceso. La configuración de desarrollo de Codex no publica la aplicación.

El código fuente se conserva en este directorio; no se ha enviado automáticamente al repositorio remoto. El historial de configuración previo se preserva en [docs/setup-history.md](docs/setup-history.md), con estados antiguos que no sustituyen este documento.

## Monitor propio de cámara: iPhone → Windows

El modo **Monitor de cámara → Cámara del navegador**, en `/camera`, permite usar Windows como visor de la cámara trasera abierta dentro del navegador. No requiere iniciar sesión en Meta, OpenAI, instalar una aplicación de duplicación ni contratar un servicio adicional. Esta incorporación está preparada localmente; su publicación se verifica por separado del despliegue Pro indicado arriba.

1. Abre Pulso en la laptop y entra en Monitor de cámara → Cámara del navegador.
2. Genera un QR y escanéalo con el iPhone.
3. Abre el enlace en Safari y pulsa **Permitir cámara y conectar**.
4. Mira el encuadre en Windows; puedes reflejar solo la vista, activar una cuadrícula o abrir pantalla completa.
5. Opcionalmente graba un clip desde el iPhone o con el control de la laptop. Revisa y descarga/comparte el clip desde el iPhone antes de cerrar la página.

Ambos dispositivos deben permanecer en una conexión HTTPS compatible y, preferentemente, en la misma Wi-Fi. Mantén Safari en primer plano y el iPhone desbloqueado. Las redes de invitados, aislamiento de clientes, VPN y algunos cortafuegos pueden impedir la conexión directa. No se ha añadido un servidor TURN de pago ni se garantiza conexión en cualquier red. El servidor STUN público de Cloudflare ayuda a descubrir la ruta de conexión y no recibe el vídeo.

La cámara se abre dentro del navegador: **no duplica la pantalla del sistema ni la app Cámara de Apple**. Se solicita la trasera, 1080p y 30 fps como preferencias; el resultado depende del navegador y del dispositivo, y la interfaz muestra la resolución efectivamente obtenida. La grabación no equivale a todas las opciones de la cámara nativa. Si Safari expone varias cámaras, se pueden seleccionar antes de grabar.

El visor recibe solo vídeo. La grabación opcional solicita permiso de micrófono por separado (se puede desactivar), combina audio y vídeo únicamente en el navegador y usa MediaRecorder. Prefiere MP4 cuando está disponible y, como alternativa, WebM. Máximo 3 minutos o aproximadamente 180 MB por clip, con límite automático para reducir el consumo de memoria. Compartir/Guardar depende de las opciones de iOS; Descargar permite guardarlo en Archivos. No se ha probado aún con un iPhone físico. La grabación puede perderse al cerrar o recargar antes de guardar; no existe recuperación desde el servidor.

### Conexión temporal y privacidad

- Vídeo y controles viajan mediante WebRTC cifrado entre los dispositivos. Los archivos no se envían al servidor, al almacenamiento de Pulso ni a OpenAI.
- Solo las descripciones de conexión se intercambian mediante `/api/camera/rooms`. Se reutiliza el Redis existente **durante un máximo de cinco minutos**, sin crear otra base ni un historial de vídeo. Los datos de emparejamiento se borran al confirmar la conexión o al cerrar; si no se completa, caducan automáticamente. El vídeo conectado puede continuar tras borrar ese emparejamiento.
- Cada QR tiene una clave de envío y el monitor una clave distinta. Solo se admite un iPhone por QR. Las claves se guardan como hashes en el servidor y el enlace del iPhone las lleva en el fragmento `#`, que no se envía en la URL HTTP. El fragmento se retira de la barra al abrir la página; no se usa localStorage para las claves.
- El QR debe compartirse solo con el iPhone previsto. Los endpoints verifican roles, origen en escrituras, caducidad, tamaño de SDP y límites de creación. No hay claves ni descripciones SDP en logs.
- Una vez conectados no se sigue consultando al servidor para mantener el vídeo. El seguimiento diario y las funciones de IA no intervienen. Se mantienen los límites del plan existente de alojamiento y Redis; no se promete capacidad ilimitada.

En desarrollo, Vite conserva el Host original en el proxy para validar el origen correctamente. En Vercel, `/camera` se reescribe al cliente y `/api/camera/*` al servidor. Sin Redis en Vercel se rechaza la creación de salas para evitar emparejamientos que se pierdan entre funciones.

Pruebas nuevas: caducidad, separación de roles, exclusión de un segundo iPhone, origen de solicitudes y conexión WebRTC entre dos navegadores Chromium con cámara y micrófono sintéticos. El test funcional comprueba imagen real transmitida, ausencia de audio en el visor, grabación/descarga local y cierre de cámara. Esto no sustituye la prueba con Safari/iPhone y la red doméstica del propietario.

Para ejecutar la prueba WebRTC completa en un entorno cuyo Chromium administrado bloquea UDP, usa un navegador de pruebas compatible y establece `PULSO_RTC_CHROMIUM_EXECUTABLE_PATH`. Sin esa variable la prueba de conexión se omite explícitamente si detecta la política `disable_non_proxied_udp`; las demás pruebas siguen ejecutándose. En esta entrega se validó la conexión real con un Chromium Headless Shell instalado fuera del repositorio mediante `@sparticuz/chromium`, sin modificar las políticas del navegador del sistema. El navegador alternativo es solo una herramienta local de pruebas, no una dependencia de producción.

Estado de publicación del monitor: pendiente. El entorno actual rechaza `https://vercel.com` y `https://api.vercel.com` con `403 Forbidden` en el túnel del proxy. Estos destinos ya figuran en la configuración guardada, pero eso no demuestra que estén permitidos en la instancia activa. Hay que aplicar los permisos de red del entorno y después renovar la autenticación de Vercel. La solicitud de acceso de red de esta sesión no concedió permisos adicionales. No se generó un nuevo enlace de acceso válido ni se desplegó el monitor.


## Pulso Screen: prototipo para usar Cámara de Apple

El propietario confirmó que la grabación de pantalla del iPhone muestra Cámara y acepta renovar semanalmente la instalación gratuita. Esto es una señal de viabilidad, no una validación de transmisión ReplayKit.

Se añadió `native/ios/` con app iOS, extensión de configuración y extensión de subida, además de un workflow **manual** de GitHub Actions para producir un IPA **sin firmar**. El modo **Pantalla del iPhone (app propia)** es ahora la opción inicial del monitor. La página `/screen` enlaza con la app mediante un esquema local y no solicita cámara al navegador. El modo anterior permanece disponible explícitamente como Cámara del navegador.

La implementación usa `setupInfo` de ReplayKit para pasar el enlace privado entre extensiones, sin App Groups ni entitlements de pago. Solo procesa buffers de vídeo; no abre una cámara ni captura micrófono. El monitor no puede iniciar/detener la grabación de Cámara de Apple. La firma e instalación locales desde Windows, la continuidad al abrir Cámara y la estabilidad deben comprobarse en el teléfono. No se ha compilado la app iOS en este entorno Linux y todavía no hay un IPA validado.

Lee [native/ios/README.md](native/ios/README.md) antes de ejecutar el workflow: comprueba la cuota gratuita de macOS, conserva las dos extensiones al firmar y utiliza tu cuenta Apple solo en el instalador local. El workflow no se ejecuta con cada push ni activa facturación. La compilación usa un paquete WebRTC con versión/commit fijos y verificación de checksum de SwiftPM. Los pasos de validación y compilación de Swift se ejecutarán en el Mac remoto, no se presentan como pasados aquí.

La web necesita un despliegue con esta versión antes de probar el IPA; publicar código en GitHub o generar el archivo no actualiza Vercel. El acceso de red a Vercel seguía bloqueado en este entorno, por lo que no se afirma que esta versión esté publicada.


### Progreso real del prototipo de iPhone

El propietario completó la compilación #3 de GitHub del commit `4606a1c`, descargó el IPA, lo instaló con Sideloadly y logró abrir Pulso Screen tras autorizarlo en iOS. La transmisión todavía no está validada. Una captura mostró texto blanco sobre fondo claro y mensajes ocultos por el teclado; se corrigieron los colores de ambas pantallas, el cierre y desplazamiento del teclado, la confirmación del pegado y los avisos de ReplayKit. La app revisa además la presencia y asociación de las extensiones sin leer credenciales ni perfiles privados. Esta corrección necesita un IPA nuevo y una prueba en el iPhone; la compilación anterior no valida los cambios nuevos.
