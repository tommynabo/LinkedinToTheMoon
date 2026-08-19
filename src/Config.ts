/**
 * Config.ts
 * Configuracion central del sistema "LinkedIn to the Moon".
 * Nada de claves API va aqui: eso vive en Script Properties (ver Settings.ts).
 */

const SHEETS = {
  PANEL: 'Panel',
  POSTS: 'Posts',
  PROSPECTOS: 'Prospectos',
  PROSPECTOS_IMPORT: 'Prospectos_Import',
  CRM: 'CRM',
  IDEAS: 'Ideas',
  HISTORICO_URLS: 'Historico_URLs',
};

const PROPERTY_KEYS = {
  CLAUDE_API_KEY: 'CLAUDE_API_KEY',
  CLAUDE_MODEL: 'CLAUDE_MODEL',
  ELEVENLABS_API_KEY: 'ELEVENLABS_API_KEY',
  ELEVENLABS_VOICE_ID: 'ELEVENLABS_VOICE_ID',
  APIFY_API_TOKEN: 'APIFY_API_TOKEN',
  APIFY_ACTOR_ID: 'APIFY_ACTOR_ID',
  DRIVE_AUDIO_FOLDER_ID: 'DRIVE_AUDIO_FOLDER_ID',
  DRIVE_IMAGE_FOLDER_ID: 'DRIVE_IMAGE_FOLDER_ID',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  OPENAI_IMAGE_MODEL: 'OPENAI_IMAGE_MODEL',
  NOTIFICATION_EMAIL: 'NOTIFICATION_EMAIL',
};

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1';

// Hora (0-23) a la que corre el autopiloto diario (ver Autopilot.ts).
const AUTOPILOT_HORA = 8;

// Formato aceptado como "perfil hiper validado": linkedin.com/in/... con slug no vacío.
const LINKEDIN_URL_REGEX = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%À-ÿ]+\/?$/i;

// Perfil de cliente ideal (seccion 02 del PDF). Se inyecta en todos los prompts.
export const ICP_DESCRIPTION = `
Segmentos objetivo (ICP):
1) Empresas B2B de alto nivel, agencias consolidadas y líderes de mercado (ej. consultora #1 de Youtube España, app fitness #1 de España).
2) Operaciones que necesitan resolver cuellos de botella matemáticos y de volumen en la adquisición de clientes.

Dolor que resuelve: No hacemos "tonterías de automatizaciones" ni "bots de WhatsApp" genéricos. Construimos verdaderas arquitecturas de datos (refinerías) y sistemas de prospección B2B complejos (como FlowNext o ApexEngine) que resuelven los límites de volumen y scraping. Hablamos de sistemas técnicos que extraen, limpian, hiper-personalizan y superan los límites de LinkedIn de forma sistemática para inyectar prospectos hiper-cualificados directamente.
`.trim();

// Pilares de contenido fijos (seccion 4.1). El motor de contenido rota entre ellos.
interface ContentPillar {
  nombre: string;
  objetivo: string;
  ejemploAngulo: string;
}

const CONTENT_PILLARS: ContentPillar[] = [
  {
    nombre: 'Sistemas de Prospección / Arquitectura (FlowNext)',
    objetivo: 'Explicar de forma técnica cómo construyes arquitecturas complejas de prospección B2B que resuelven cuellos de botella de volumen.',
    ejemploAngulo: 'Sabes exactamente cuántos días de trabajo manual te separan de quebrar. El problema no es el volumen, es la arquitectura de datos que usas para refinar 1000 leads.',
  },
  {
    nombre: 'Casos de Éxito Top / Resultados',
    objetivo: 'Demostrar autoridad brutal y seca con clientes reales de élite.',
    ejemploAngulo: 'Cómo le montamos el sistema de prospección a la app fitness #1 de España para superar sus límites de adquisición.',
  },
  {
    nombre: 'Anti-Automatización Básica (Contrarian)',
    objetivo: 'Atacar las automatizaciones mediocres (bots de WhatsApp, IA básica) y defender los verdaderos sistemas de ingeniería de datos.',
    ejemploAngulo: 'Todos venden agentes de WhatsApp que no sirven. Nosotros construimos refinerías de datos que saltan las limitaciones y cualifican de verdad.',
  },
  {
    nombre: 'Calidad vs Cantidad / Hiper-Personalización (ApexEngine)',
    objetivo: 'Mostrar cómo los sistemas complejos (lectura fría, inferencia de datos) consiguen tasas de respuesta imposibles para el outreach manual.',
    ejemploAngulo: 'Mandar 100 DMs genéricos no sirve. Inyectar 25 prospectos diarios con hiper-personalización algorítmica es lo que cierra tratos.',
  }
];

// Reglas de puntuacion de prospectos (seccion 5.2).
const SCORE_RULES = {
  BIO_KEYWORDS: 3, // bio menciona "coach", "consultor", "mentor", "fundador de comunidad"
  ACTIVO_14_DIAS: 2, // publicó en los últimos 14 días
  SEGUIDORES_RANGO: 2, // entre 1.000 y 20.000 seguidores
  VENDE_PROGRAMAS: 1, // menciona que vende cursos, mentorías o programas
  YA_EN_CRM: -3, // ya es cliente / ya fue contactado / marcado "no contactar"
};

const SCORE_KEYWORDS = ['coach', 'consultor', 'consultora', 'mentor', 'mentora', 'fundador de', 'fundadora de'];
const PROGRAMA_KEYWORDS = ['curso', 'mentoría', 'mentoria', 'programa', 'membresía', 'membresia', 'formación', 'formacion'];

const BLACKLIST_KEYWORDS = ['futbol', 'fútbol', 'soccer', 'deportivo', 'deportiva', 'entrenador personal', 'personal trainer'];

const PROSPECTOS_POR_DIA = 25;
