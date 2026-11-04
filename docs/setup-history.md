# Pulso · Tu radar de contenido

Una primera versión de una herramienta propia para estudiar contenido de nutrición y fitness: seguir competidores, comparar publicaciones públicas y desarrollar ideas originales.

## Arrancar

Requiere Node.js 22 o posterior; el entorno se ha preparado con Node.js 24.19.0.

```bash
cd /workspace/instagram-analizador
npm ci
npm run dev
```

`npm run dev` inicia el cliente Vite en el puerto 5173 y la API en el 3001. El cliente envía `/api` al servidor. Las fuentes se incluyen en la instalación y no requieren Google Fonts.

Sin credenciales se puede explorar una muestra ficticia, probar los filtros y guardar ideas. Esto no establece una conexión real con Instagram.

```bash
npm test            # Pruebas del modelo, servidor y controles de OAuth
npm run test:browser # Pruebas funcionales con Chromium
npm run build       # Compilación de producción
npm start           # API y cliente compilado en el puerto 3001
```

Las pruebas de navegador usan `/usr/bin/chromium` cuando existe. También puedes establecer `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` o instalar el navegador administrado por Playwright con `npx playwright install chromium`. La sincronización probada en navegador usa respuestas simuladas; no demuestra autorización real de Meta.

## Abrir la aplicación fuera del entorno de Codex

Publicar o guardar el entorno de Codex conserva el espacio de desarrollo. **No publica la aplicación web ni crea una dirección pública.** Los puertos del entorno no son una vista previa disponible en esta pantalla.

Para abrir Pulso desde tu navegador remoto necesitas desplegarla en un alojamiento web. La configuración principal es **Vercel**: `vercel.json` compila Vite, sirve `dist` y dirige las rutas `/api/*` al handler Express exportado desde `api/index.js`. En Vercel, el servidor no abre un puerto propio.

### Desplegar en Vercel

El proyecto se puede subir directamente con la CLI desde esta carpeta, sin depender de que el repositorio remoto tenga commits:

```bash
npx vercel login
npx vercel deploy --prod
```

Selecciona tu cuenta o equipo y crea o enlaza el proyecto deseado. Si ya existe un proyecto, confirma su nombre antes de cambiar su configuración. La dirección que devuelva un despliegue terminado es la URL real de la aplicación. Todavía hay que comprobar esa dirección y sus rutas `/api/health` y `/api/instagram/status`; preparar archivos no equivale a desplegar.

Para una primera visita no hacen falta credenciales: la aplicación muestra su demo. La conexión real con Instagram requiere añadir en **Vercel → Project → Settings → Environment Variables**:

- `META_APP_ID` y `META_APP_SECRET`, de tu app de Meta.
- `APP_URL`, con el origen HTTPS estable de la aplicación. Registra en Meta `APP_URL/api/instagram/callback` como URI exacta y vuelve a desplegar después de cambiar variables.
- `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, de una base Redis conectada desde Vercel Marketplace, o la pareja equivalente `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Los tokens son secretos y solo deben introducirse en los ajustes del proveedor.

Redis comparte las sesiones, los estados OAuth de un solo uso y la limitación de consultas entre distintas instancias. Las entradas tienen caducidad y se separan por `APP_URL`. En Vercel, la autorización de Instagram permanece deshabilitada si falta este almacenamiento: no se usa una sesión en memoria que pueda perderse entre peticiones. El modo demo sigue disponible. Las pruebas de Redis usan un transporte simulado; la base real requiere su propia comprobación.

También se conserva `render.yaml` como alternativa para un servidor Node persistente. En Render, crea un servicio con compilación `npm ci --include=dev && npm run build`, arranque `npm start` y comprobación `/api/health`. La configuración propone el plan gratuito; revisa las condiciones y disponibilidad en tu cuenta. Las sesiones locales en memoria terminan al reiniciar el servicio.

Si prefieres ejecutarla en tu propio ordenador, descarga el proyecto, instala Node.js 22 o posterior y ejecuta `npm ci` y `npm run dev` desde la carpeta del proyecto.

## Conectar directamente con Instagram

La integración utiliza **Instagram API with Facebook Login**, Business Discovery y Graph API v23.0. No usa scraping, contraseñas de Instagram ni servicios de terceros.

1. Utiliza una cuenta profesional de Instagram (empresa o creador) vinculada a una página de Facebook que administres.
2. Crea/configura una app en [Meta for Developers](https://developers.facebook.com/) con Instagram API con inicio de sesión de Facebook y el producto de inicio de sesión correspondiente. Las opciones concretas del panel pueden cambiar; sigue la documentación de Meta para tu app.
3. Si utilizas una configuración de Facebook Login for Business, selecciona **token de acceso de usuario** (no token de usuario del sistema), guarda el ID de esa configuración en `META_LOGIN_CONFIG_ID` e incluye los permisos que se indican a continuación. Este campo es opcional; la app también admite el flujo manual con permisos explícitos. Configura los permisos `instagram_basic`, `instagram_manage_insights`, `pages_show_list` y `pages_read_engagement`. En modo desarrollo, la persona que autoriza debe tener el rol adecuado en la app y acceso a la página y cuenta vinculadas. El acceso para usuarios externos puede requerir revisión y acceso avanzado de Meta.
   Si tu rol de página fue concedido mediante Business Manager, la documentación de Business Discovery exige además `ads_read` o `ads_management`. En ese caso utiliza una configuración de inicio de sesión con `ads_read` y los permisos anteriores. No solicites permisos publicitarios si no aplican a tu caso.

4. En la configuración de inicio de sesión de Meta, registra el origen público y la URI exacta `https://TU-DOMINIO/api/instagram/callback`. La URL tiene que apuntar a esta aplicación. En desarrollo local usa una URL de desarrollo admitida por Meta; para acceso remoto necesitas un origen HTTPS público.
5. Define en el servidor `META_APP_ID`, `META_APP_SECRET` y `APP_URL`. `APP_URL` es el origen público de Pulso, sin el sufijo del callback. Puedes usar la configuración segura del entorno o copiar `.env.example` a un nuevo `.env` local y rellenarlo. **No pegues secretos en el chat, en el código ni en Git.** El `.env` está ignorado.
6. Reinicia el servidor. Abre **Conectar Instagram → Continuar con Meta**, autoriza la app y selecciona las páginas/cuentas necesarias. Si dispones de varias cuentas vinculadas, elige la que se usará en **Mi conexión**.
7. En **Competidores**, añade el nombre de usuario de una cuenta profesional pública. La primera consulta satisfactoria sustituye las cuentas de demostración. Después puedes volver a sincronizar cada competidor.

Documentación oficial:

- [Inicio de Instagram API con Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started)
- [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)

El servidor necesita acceso HTTPS a `graph.facebook.com`; el navegador utiliza `www.facebook.com` para la autorización. Las credenciales reales y los permisos de Meta son necesarios para comprobar la integración de extremo a extremo. Este entorno no los tenía durante la implementación.

## Qué se analiza

- Cuenta pública profesional: nombre de usuario, nombre, seguidores actuales y cantidad de publicaciones, cuando Meta los devuelve.
- Hasta 50 publicaciones recientes por consulta: descripción, fecha, formato, enlace, likes y comentarios públicos. Se identifica un reel mediante `media_product_type`.
- Interacciones conocidas: likes + comentarios. Los likes ocultos o no disponibles se muestran como no disponibles; el total puede ser incompleto.
- Proporción por publicación: `(likes + comentarios) / seguidores actuales × 100`. No equivale a alcance ni es un historial de seguidores. La proporción no se calcula cuando faltan likes o seguidores.
- Filtros por fecha, formato, cuenta y texto; orden por interacciones, proporción o fecha.
- Temas y propuestas editoriales mediante reglas sobre descripciones y publicaciones de referencia. No hay un modelo de IA conectado ni predicciones de viralidad. Puedes editar y guardar títulos y guiones.

Esta versión no solicita guardados, compartidos, alcance interno ni reproducciones de competidores. La documentación actual de Meta describe `view_count` para algunas publicaciones públicas y advierte de que puede incluir métricas pagadas y orgánicas; ese campo todavía no está incorporado ni validado en esta app. Tampoco se descargan vídeos, transcriben audios o analizan escenas. Las portadas de la biblioteca son ilustraciones generadas por la interfaz, no las miniaturas originales.

La gráfica agrupa por fecha de publicación las interacciones acumuladas que tiene la muestra en el momento de consulta. No representa las interacciones ocurridas en cada fecha. La sincronización es manual, no continua. Cada sincronización reemplaza la muestra de esa cuenta; no construye un histórico ni pagina más allá de 50 publicaciones.

## Datos y sesiones

Las cuentas, publicaciones e ideas se guardan en `localStorage` del navegador. Puedes exportar una copia JSON desde **Datos y ajustes**. Todavía no hay una base de datos, importación de copias, cuentas de usuario propias ni sincronización entre dispositivos. El borrado local pide confirmación.

Los tokens de Meta se guardan en el servidor durante un máximo de ocho horas: en memoria para desarrollo local o en Redis cuando se configura almacenamiento compartido. En Vercel se requiere Redis para activar Instagram. No se envían al cliente, no se guardan en `localStorage` ni aparecen en exportaciones. Los enlaces de paginación de Meta se filtran porque pueden contener tokens. Con almacenamiento local en memoria, reiniciar el servidor obliga a conectar de nuevo. Redis permite compartir la sesión entre instancias hasta su caducidad. Las cookies de sesión son HttpOnly y SameSite=Lax; se marcan Secure cuando `APP_URL` usa HTTPS. La conexión OAuth verifica un estado aleatorio de un solo uso y las operaciones autenticadas comprueban un token CSRF.

Desconectar termina la sesión local de Pulso; para revocar la autorización de la app en Meta, utiliza sus ajustes de aplicaciones. Esta versión está preparada como herramienta personal de desarrollo, sin funciones para publicar, programar contenido o gestionar múltiples usuarios.

## Estado de esta entrega

La instalación, compilación y pruebas locales se pueden ejecutar sin credenciales. La aplicación está desplegada en producción en https://instagram-analizador.vercel.app. Se comprobaron sin autenticación la página principal, su JavaScript compilado, `/api/health` y `/api/instagram/status`: todos devolvieron HTTP 200. La demo está disponible; Instagram sigue sin configurar. La autorización y las consultas contra Instagram real requieren además la app de Meta, su origen público, los permisos y, en Vercel, un almacén Redis configurado. Los tests simulados no sustituyen esa validación.

## Activación de Instagram en el proyecto publicado

La cuenta de Instagram del propietario ya es profesional y está vinculada a una página de Facebook que administra. `APP_URL=https://instagram-analizador.vercel.app` se guardó en las variables de producción de Vercel. Guardar una variable no actualiza por sí solo el despliegue que está activo; se aplicará en el siguiente despliegue.

### Redis conectado y verificado

Tras la aceptación del propietario se creó `pulso-sesiones` con Upstash for Redis, plan `free`, región `iad1`, `autoUpgrade=false` y `prodPack=false`, conectado solo a Production y sin descargar secretos localmente. El recurso de Vercel es `store_YXH4DZZ3jyQMBeCS`. Las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` se inyectaron en producción y la app las utiliza para compartir las sesiones.

La autorización del proveedor ya se completó. No repitas el aprovisionamiento para iniciar el desarrollo ni crees otra base por defecto.

Se publicó una nueva versión y se verificó `/api/health`: este endpoint realiza una lectura real de Redis antes de devolver HTTP 200 cuando el almacén es compartido. `/api/instagram/status` confirmó `sessionMode=shared` y solo quedaron pendientes `META_APP_ID` y `META_APP_SECRET`. Esto verifica conectividad y lectura de Redis; el flujo real de creación de sesión se comprobará al completar la autorización de Meta. Las credenciales permanecen en Vercel.

### App de Meta

En https://developers.facebook.com/apps/, crea o elige tu propia app y configura Instagram API con Facebook Login y Facebook Login for Business. Registra esta URI de retorno exacta:

`https://instagram-analizador.vercel.app/api/instagram/callback`

En https://vercel.com/ferrecontrol-s-projects/instagram-analizador/settings/environment-variables, guarda en **Production** `META_APP_ID` y `META_APP_SECRET`. Si has creado una configuración de inicio de sesión con token de usuario, guarda además `META_LOGIN_CONFIG_ID`. Estos valores deben introducirse directamente en Vercel; no pegues claves en el chat. Para uso propio en desarrollo, el usuario que autoriza debe tener el rol requerido en la app. Los requisitos de revisión o verificación que exija Meta se completan en su panel.

Después de conectar Redis y guardar las variables de Meta, vuelve a desplegar y prueba **Conectar Instagram → Continuar con Meta**, seleccionando la página y la cuenta profesional. Comprueba una consulta real de un competidor antes de afirmar que la integración está operativa.


### Estado más reciente de la autorización

Las variables `META_APP_ID` y `META_APP_SECRET` ya se guardaron en Production y se aplicaron mediante el despliegue `dpl_3TuYozoBQCPpBjXKGk2CYr61ZkNo`. No se copiaron sus valores al código ni a este documento.

La API pública confirmó `configured=true`, `missing=[]`, `sessionMode=shared` y `connected=false` para un navegador sin sesión. Se verificaron la salud con lectura real de Redis, la redirección HTTPS a Facebook, el formato numérico del ID público de la app, la URI de retorno esperada y la cookie OAuth segura. Con un cliente de prueba propio se simuló una denegación y se comprobó la creación/consumo del estado OAuth en Redis y el rechazo de repetirlo. Esto no autoriza ninguna cuenta de Meta ni valida sus permisos.

El propietario debe abrir https://instagram-analizador.vercel.app, pulsar **Conectar Instagram → Continuar con Meta** y autorizar la página y cuenta profesional. Después hay que comprobar `connected=true` en ese mismo navegador y realizar una consulta real de un competidor. La documentación pública `/api/instagram/status` sin cookies nunca demuestra que otro navegador haya iniciado sesión.


### Diagnóstico de la selección de Página tras autorizar

El propietario informó que logró vincular el Instagram a otra Página creada después y confirmó que esa nueva Página está seleccionada en la autorización de Pulso. No repetir comprobaciones de permisos de la Página ni volver a pedir claves por defecto.

La versión de diagnóstico distingue `no-pages` (Meta no devuelve ninguna Página), `missing-permissions` (la inspección de permisos confirma que falta alguno) y `no-linked-instagram` (hay Páginas pero ninguna entrega un `instagram_business_account` accesible). Si la inspección de permisos falla, se mantiene como desconocida, sin inventar una denegación. Recorre la paginación de Páginas antes de concluir que no existe una cuenta.

En los fallos registra `pulso_meta_account_discovery` con el motivo, cantidad de Páginas y nombres de permisos ausentes; nunca registra tokens, nombres ni identificadores de cuentas. Los errores de conexión se muestran en el diálogo para que no desaparezcan con la notificación temporal. El inicio de sesión incluye `auth_type=rerequest`, conservando los cuatro permisos o la configuración Business Login si se especificó.

Las pruebas de descubrimiento se ejecutan con respuestas simuladas. Hay que repetir la autorización real después de publicar y leer el nuevo diagnóstico antes de afirmar la causa o la resolución. Las 22 pruebas de servidor/modelo/almacén y la prueba de navegador del diagnóstico persistente pasaron.


### Recuperación de activos concedidos cuando el listado de Páginas queda vacío

Las capturas del propietario confirman que el flujo de Meta seleccionó una Página nueva llamada «Jesus nutricion fitness», la cuenta `jesus.nutricion.fit` y los cuatro permisos solicitados. La Página anterior «Jesus Nutrición y Fitness» no estaba seleccionada. Meta confirmó la autorización, pero el retorno de Pulso indicó que `/me/accounts` no devolvió Páginas. No asumir que el usuario olvidó seleccionar los activos.

El descubrimiento ahora inspecciona `debug_token` únicamente en el servidor y para el token válido de esta misma app, usando la credencial de aplicación existente sin exponerla. Recupera los objetivos de `granular_scopes` concedidos: verifica las cuentas de Instagram con una lectura autorizada de `id,username,media_count` usando el token del usuario y las Páginas mediante su relación `instagram_business_account`. No acepta activos de otra app ni IDs arbitrarios no verificados. Maneja IDs de texto y números representables exactamente, y rechaza IDs numéricos que hayan perdido precisión. Los límites de consulta se mantienen explícitos.

Los fallos distinguen la inspección de concesiones de la lectura del objeto de Instagram. Se conservan únicamente códigos/subcódigos numéricos de Meta para el diagnóstico del servidor; no se registran tokens ni respuestas privadas. Las 31 pruebas de servidor/modelo/almacén/discovery y la compilación pasaron. Se publicó `dpl_ACDDHENcFHeg1qJ5Wh6hftWqC1Mq`. Aún se requiere una autorización real del propietario con esta versión para confirmar el inicio de sesión y probar un competidor; las pruebas de concesiones usan un transporte simulado.
