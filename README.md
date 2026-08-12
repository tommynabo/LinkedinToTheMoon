# LinkedIn to the Moon — Sistema de Adquisición de Clientes (full autopiloto)

Implementación del plan descrito en [`linkedin_to_the_moon_sistema.pdf`](linkedin_to_the_moon_sistema.pdf):
un Google Sheets como panel de control + Google Apps Script (TypeScript) con **3 motores
automatizados** que corren solos cada día a las 8:00, más 2 acciones 100% manuales
(publicar y enviar), que son precisamente las que LinkedIn penaliza si se automatizan.

## ¿Hace falta Google Sheets? ¿Hay algo más sencillo?

Técnicamente podrías sustituirlo por Airtable, Notion o una base de datos + email/Slack,
pero para tu objetivo real — *"entro, y ya me encuentro los 25 mensajes listos"* — Google
Sheets **es** la opción más sencilla posible:

- Es gratis, ya tienes cuenta, y el motor que lo ejecuta (Apps Script) vive *dentro* del
  propio Sheet — no hay que levantar un servidor, base de datos ni backend en ningún sitio.
- Sirve directamente como visor: abres el Sheet y ves la tabla de 25 filas ya rellenas.
- El único "coste" es dejar el proyecto vinculado la primera vez (`npm run create`), que se
  hace una sola vez.

Por eso el sistema sigue centrado en Sheets, pero ahora corre en **autopiloto real**: no
hace falta que abras nada ni pulses ningún botón para que se genere — un trigger diario deja
el trabajo hecho a las 8:00 y te avisa por correo cuando está listo.

```
TRIGGER DIARIO 8:00 (ScriptApp) ──▶ ejecutarRutinaDiariaAutomatica()
  ├─ 1) generarPostDelDiaCore()          → Claude (+ OpenAI Images si está configurado)
  ├─ 2) buscarProspectosDeHoyCore()      → Apify / import manual, validados y puntuados
  └─ 3) personalizarMensajesYAudiosCore()→ Claude + ElevenLabs (si está configurado)
        └─ correo-resumen con MailApp cuando termina (o si algo falla)
```

Tú abres el Sheet cuando quieras a partir de las 8:00 y encuentras: el post del día (con
imagen si tienes OpenAI configurado) en "Posts", y los 25 prospectos con mensaje + audio ya
generados en "Prospectos". Tú siempre revisas y ejecutas manualmente: publicar el post y
enviar la conexión/DM (es justo lo que LinkedIn vigila si se automatiza).

## Estructura del proyecto

```
src/
  appsscript.json          Manifest de Apps Script (scopes, timezone)
  Config.ts                Pilares de contenido, ICP, reglas de scoring, nombres de propiedades
  SheetUtils.ts             Helpers de lectura/escritura + sanitización anti formula-injection
  ScoringUtils.ts           Puntuación y deduplicación de prospectos (sección 5.2/5.3 del PDF)
  ValidationUtils.ts        "Hiper validación" de formato de URL/datos antes de aceptar un prospecto
  DriveUtils.ts             Helper para crear/reutilizar carpetas de Drive (audio e imágenes)
  ClaudeClient.ts           Wrapper de la API de Anthropic (Claude)
  ElevenLabsClient.ts       Wrapper de Text-to-Speech + guardado en Drive
  ImageClient.ts            Wrapper de OpenAI Images (portada del post) + guardado en Drive
  ApifyClient.ts            Wrapper para lanzar un actor de Apify (scraping de LinkedIn)
  ContentEngine.ts          Motor ① — genera el post diario (+ imagen opcional)
  ProspectingEngine.ts      Motor ② — busca, valida, puntúa y deduplica prospectos
  PersonalizationEngine.ts  Motor ③ — mensaje + audio personalizados por prospecto
  Autopilot.ts              Trigger diario 8:00 + correo-resumen (MailApp)
  SheetSetup.ts             Crea las pestañas del Sheet y el panel de KPIs
  Settings.ts               Guarda claves de API en Script Properties (nunca en el código)
  Menu.ts                   Menú custom (autopiloto + ejecución manual de cada motor)
```

## 1) Requisitos

- Node.js 18+ y npm
- Una cuenta Google con Google Sheets y Google Drive
- `clasp` (Command Line Apps Script Projects) de Google — se instala como devDependency

## 2) Instalación

```bash
cd LinkedinToTheMoon
npm install
npm run login          # abre el navegador para autorizar clasp con tu cuenta Google
```

### Vincular el proyecto a un Google Sheets nuevo

```bash
npm run create          # crea un Spreadsheet + proyecto de Apps Script enlazado
```

Esto genera un `.clasp.json` real con el `scriptId` de tu proyecto (ya está en `.gitignore`,
no se sube al repo). Si prefieres enlazarlo a un Sheet que ya existe, abre
Extensiones → Apps Script en ese Sheet, copia el "ID del proyecto de secuencia de comandos"
y pégalo en un `.clasp.json` basado en `.clasp.json.example`.

### Subir el código

```bash
npm run push
npm run open            # abre el Google Sheets en el navegador
```

## 3) Primer arranque (dentro del Google Sheets)

1. Recarga la hoja para que aparezca el menú **🚀 LinkedIn to the Moon**.
2. Menú → **🛠 Inicializar sistema** (crea las pestañas `Panel`, `Posts`, `Prospectos`,
   `Prospectos_Import`, `CRM`, `Ideas`).
3. Menú → **⚙️ Configurar claves API** e introduce (deja en blanco lo que no uses):
   - Clave de API de Claude — **obligatoria**, la usan los motores 1 y 3
   - Clave de API + Voice ID de ElevenLabs — opcional, sin esto el motor 3 solo genera texto
   - Token de API + ID de actor de Apify — opcional, sin esto el motor 2 usa el import manual
   - Clave de API de OpenAI — opcional, sin esto el post se genera sin imagen de portada
   - Email para el correo-resumen — opcional, si lo dejas vacío se usa tu propio email de Google
4. Menú → **🤖 Activar autopiloto diario (8:00)**. Con esto queda instalado el trigger: cada
   día a las 8:00 se ejecutan los 3 motores solos, sin que tengas que abrir nada.
5. La primera vez que ejecutes cualquier función (incluida la activación del autopiloto),
   Google pedirá autorizar los permisos (Sheets, Drive, llamadas externas, envío de correo).
   Es normal, acéptalo una sola vez.

## 4) Uso diario en autopiloto (sección 08 del PDF, ahora sin los 3 clics)

1. A las 8:00 corre solo `ejecutarRutinaDiariaAutomatica()`: genera el post (+ imagen si
   procede), busca hasta 25 prospectos nuevos ya validados y puntuados, y les genera mensaje
   (+ audio si procede).
2. Te llega un correo ("🚀 tu día está listo" o "⚠️ con errores") con el resumen y el link
   directo al Sheet.
3. Abres el Sheet cuando quieras: pestaña "Posts" tiene el borrador de hoy listo para
   publicar tú mismo; pestaña "Prospectos" tiene las filas con mensaje/audio ya generados.
4. Envías tú, uno a uno, la conexión/mensaje/audio ya preparado. Marca cada fila como
   `Enviado` o `Descartado` en la columna "Estado".
5. Menú → **Mover Enviados/Descartados al CRM** para archivar el histórico y liberar la cola.

Si prefieres controlar el momento exacto en vez de dejarlo en autopiloto, usa el submenú
**"Ejecutar ahora (manual)"** con los 3 motores por separado (igual que antes).

Ritual semanal (domingo, 5-10 min): añade ideas sueltas en la pestaña "Ideas" (columna
"Idea suelta") — el motor de contenido las prioriza antes de generar desde cero.

Ritual semanal (revisión, 15 min): menú → **📊 Actualizar resumen** para ver tasas de
aceptación/respuesta calculadas desde el CRM (sección 10 del PDF).

## 5) Fuente de prospectos: automática vs. manual

El PDF recomienda empezar manual y automatizar después (roadmap, sección 09):

- **Manual (Fase 1, recomendado al empezar)**: exporta perfiles desde LinkedIn/Sales
  Navigator y pégalos en la pestaña `Prospectos_Import` con columnas
  `Nombre, URL perfil, Cargo, Empresa, Bio, Último post, Seguidores`. Al pulsar
  "Buscar Prospectos de Hoy" sin token de Apify configurado, el sistema usa esas filas,
  las puntúa, deduplica y luego vacía la pestaña de import.
- **Automática (Fase 3)**: configura un actor de Apify orientado a LinkedIn y guarda su
  token + actor ID. `ApifyClient.ts` normaliza los campos más habituales
  (`fullName`/`profileUrl`/`headline`/...); si tu actor usa nombres distintos, ajusta
  `normalizeApifyItem()`.

En ambos casos, antes de puntuar/escribir en el Sheet, `ValidationUtils.ts` descarta
cualquier candidato sin nombre, sin cargo o sin una URL con formato `linkedin.com/in/...`
válido (el "link del perfil hiper validado" que pediste). Esto es una validación de
**formato y completitud**, no de "visitar el perfil para comprobar que existe": visitar
perfiles de forma automática es justo el tipo de actividad que puede hacer saltar las
alarmas anti-bot de LinkedIn, así que el sistema no lo hace.

## 5bis) Imagen de portada del post (opcional)

Si configuras una clave de OpenAI, `ContentEngine.ts` genera automáticamente una imagen de
portada (OpenAI Images, `gpt-image-1`) a partir del pilar y el hook ganador, la guarda en una
carpeta de Drive ("LinkedIn to the Moon - Imágenes") y escribe el link en la nueva columna
"Imagen" de la pestaña "Posts". Sin esa clave, el post se genera igual, solo que sin imagen.

## 6) Seguridad

- Ninguna clave de API se guarda en el código ni en el spreadsheet: todo vive en
  **Script Properties**, accesible solo desde el propio proyecto de Apps Script.
- Todo texto proveniente de fuentes externas (scraping, CSV pegado, respuestas de IA) pasa
  por `sanitizeForSheet()` antes de escribirse, para neutralizar "formula/CSV injection"
  (celdas que empiezan por `=`, `+`, `-` o `@`).
- Revisa los términos de ElevenLabs para clonación de voz y la normativa local sobre
  transparencia de voz generada por IA en comunicaciones comerciales (sección 6.2 del PDF).
- El correo-resumen usa `MailApp` (cuota gratuita diaria de Apps Script, sin acceso a tu
  bandeja de Gmail), y solo envía un resumen de texto, nunca credenciales.

## 7) Límites de LinkedIn (sección 11 del PDF)

- Publicar y enviar quedan **siempre manuales** — es lo único que LinkedIn vigila.
- Empieza con 10-12 contactos/día las primeras 2 semanas si la cuenta es nueva, y sube
  progresivamente hasta 20-25/día (`PROSPECTOS_POR_DIA` en `Config.ts`).
- Prueba el envío de audio con los primeros 10-15 prospectos antes de escalar al lote
  completo.
- El autopiloto solo automatiza *preparación*; seguirás siendo tú quien pulsa "conectar" y
  "enviar" en LinkedIn cada mañana, para no perder el control ni arriesgar la cuenta.
