# LinkedIn to the Moon — Web (Vercel)

Sistema de autopiloto de LinkedIn: genera el post del día, busca y puntúa prospectos, y
personaliza mensajes (+ audio opcional), 100% en Next.js + Vercel Postgres + Vercel Blob +
Vercel Cron. No requiere Google Sheets ni Apps Script.

Todo el frontend funciona como un "spreadsheet" simple (tablas editables por fila), pero los
datos viven en una base de datos Postgres real dentro de Vercel.

## Arquitectura

- **Next.js 16 (App Router)** — frontend + Server Actions (sin API routes extra, salvo el cron).
- **Vercel Postgres** — todas las tablas (`posts`, `prospectos`, `prospectos_import`, `crm`,
  `ideas`, `cron_runs`). El esquema se crea solo la primera vez que se usa (`ensureSchema()` en
  [src/lib/db.ts](src/lib/db.ts)), no hace falta ejecutar ninguna migración a mano.
- **Vercel Blob** — almacena los audios (ElevenLabs) y las imágenes de portada (OpenAI).
- **Vercel Cron** — dispara `/api/cron/daily` cada día (ver `vercel.json`).
- **Basic Auth** ([middleware.ts](middleware.ts)) protege todo el dashboard salvo `/api/cron/*`.

## Despliegue paso a paso

1. **Sube este repo a GitHub** (puedes dejar el proyecto de Apps Script en la raíz; en Vercel
   configura el **Root Directory = `web`** al importar el proyecto).
2. **Importa el repo en Vercel** (vercel.com → Add New Project → selecciona el repo → Root
   Directory: `web`).
3. **Añade el almacenamiento** desde la pestaña *Storage* del proyecto en Vercel:
   - Crea una base de datos **Postgres** (o Neon, que es lo mismo bajo el capó ahora) y
     conéctala al proyecto → esto define automáticamente `POSTGRES_URL` y variables asociadas.
   - Crea un **Blob store** y conéctalo → define automáticamente `BLOB_READ_WRITE_TOKEN`.
4. **Configura las variables de entorno obligatorias** (Project Settings → Environment
   Variables), ver [.env.example](.env.example):
   - `ANTHROPIC_API_KEY`
   - `CRON_SECRET` (una cadena aleatoria larga, ej. `openssl rand -hex 32`)
   - `DASHBOARD_USER` y `DASHBOARD_PASSWORD` (para entrar al dashboard)
   - Opcionales: `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL`), `ELEVENLABS_API_KEY` +
     `ELEVENLABS_VOICE_ID`, `APIFY_API_TOKEN` + `APIFY_ACTOR_ID`, `RESEND_API_KEY` +
     `NOTIFICATION_EMAIL`.
5. **Despliega.** El primer request a cualquier página o al cron crea el esquema de la base de
   datos automáticamente.
6. Entra a `/ajustes` en el dashboard desplegado para comprobar qué variables faltan.

## El cron diario

Definido en [vercel.json](vercel.json):

```json
{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }] }
```

`0 6 * * *` = 06:00 UTC, pensado para caer sobre las 8:00 en Madrid en **verano (CEST)**.
**Importante:** Vercel Cron siempre funciona en UTC, sin DST. En invierno (CET) esto se
ejecutará hacia las 7:00 hora local. Ajusta el valor si quieres compensarlo manualmente.

Vercel añade automáticamente la cabecera `Authorization: Bearer <CRON_SECRET>` a la petición
del cron (por eso hace falta definir `CRON_SECRET` como variable de entorno).

## Sin prospección automática (sin Apify)

Si no configuras `APIFY_API_TOKEN`/`APIFY_ACTOR_ID`, el motor de prospección usa como fuente la
tabla de staging `prospectos_import`, que se rellena desde la página **/import** pegando un
export en CSV/TSV. El cron diario los validará, puntuará, deduplicará contra el histórico y
tomará los mejores 25 automáticamente.

## Prospección automática con Apify

Actor recomendado: [`harvestapi/linkedin-profile-search`](https://apify.com/harvestapi/linkedin-profile-search)
("LinkedIn Profile Search Scraper No Cookies") — busca perfiles públicos por palabra clave/
puesto/ubicación sin necesitar cookies ni cuenta de LinkedIn, y es pago por evento (barato: ~
$0.10 por página de 25 resultados en modo "Full" + $0.004/perfil).

1. Crea una cuenta en [Apify](https://console.apify.com/sign-up) (el plan gratuito incluye $5/mes).
2. Copia tu token en Settings → Integrations y ponlo en `APIFY_API_TOKEN`.
3. Pon `APIFY_ACTOR_ID=harvestapi/linkedin-profile-search`.
4. (Opcional) `APIFY_SEARCH_QUERY` para sobrescribir la búsqueda por defecto (que usa las
   palabras clave del ICP: coach, consultor, mentor, fundador de comunidad...), y
   `APIFY_LOCATIONS` (separadas por coma) para restringir por ubicación.

Si usas otro actor de LinkedIn con un esquema de campos distinto, ajusta `normalizarItem()` en
[src/lib/apify.ts](src/lib/apify.ts).

## Notas de seguridad

- Todas las queries usan el tagged template `sql` de `@vercel/postgres` (parametrizado, sin
  riesgo de inyección SQL).
- El dashboard completo está protegido con Basic Auth; el endpoint de cron usa un bearer token
  separado.
- El sistema **no visita perfiles de LinkedIn en vivo** para "validar" — solo valida formato de
  URL y campos obligatorios, para evitar patrones de comportamiento que LinkedIn asocia a bots.
- `@vercel/postgres` está marcado como deprecated en favor de Neon nativo; sigue funcionando
  igual (incluso contra una base de datos Neon), pero si Vercel lo sugiere en el futuro, migrar
  a `@neondatabase/serverless` es un cambio aislado a [src/lib/db.ts](src/lib/db.ts).

## Desarrollo local

```bash
cd web
npm install
npm run dev
```

Necesitas un `.env.local` con al menos `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`,
`ANTHROPIC_API_KEY`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD` (puedes usar `vercel env pull` si ya
desplegaste el proyecto).
