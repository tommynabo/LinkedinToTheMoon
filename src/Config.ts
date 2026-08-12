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
const ICP_DESCRIPTION = `
Segmentos objetivo (ICP):
1) Coaches / consultores independientes (venden su conocimiento 1:1 o en grupo: ventas, SEO,
   marketing, productividad, negocios online, mentoring).
2) Dueños de comunidades / formaciones (fundadores de comunidades de pago tipo Skool, cursos
   o membresías online).
3) Infoproductores / creadores B2B (viven de contenido + producto digital, ya entienden de
   funnels y necesitan escalar operación).

Dolor que resuelve la agencia de IA para este ICP: ahorrar tiempo (automatizar atención al
cliente, onboarding y seguimiento de leads), escalar sin contratar más equipo (agentes que
cualifican, agendan y hacen soporte), y dar consistencia (sistemas que no dependen de que el
coach esté encima todo el día).
`.trim();

// Pilares de contenido fijos (seccion 4.1). El motor de contenido rota entre ellos.
interface ContentPillar {
  nombre: string;
  objetivo: string;
  ejemploAngulo: string;
}

const CONTENT_PILLARS: ContentPillar[] = [
  {
    nombre: 'Autoridad / Educativo',
    objetivo: 'Demostrar que entiendes de IA aplicada a negocios de coaching/consultoría',
    ejemploAngulo: '3 tareas que tu asistente ya podría no hacer si tuvieras esto',
  },
  {
    nombre: 'Caso de cliente / Resultado',
    objetivo: 'Prueba social concreta',
    ejemploAngulo: 'Cómo [tipo de cliente] recuperó 8h/semana con un agente de IA',
  },
  {
    nombre: 'Behind the scenes / Opinión',
    objetivo: 'Conexión humana, el algoritmo lo premia',
    ejemploAngulo: 'Lo que nadie te cuenta de meter IA en tu negocio',
  },
  {
    nombre: 'Contrarian / Mito',
    objetivo: 'Detener el scroll, generar debate',
    ejemploAngulo: 'La IA no te va a quitar clientes. Esto sí.',
  },
  {
    nombre: 'Storytelling personal',
    objetivo: 'Humanizar tu marca de agencia',
    ejemploAngulo: 'El día que un cliente casi se va por esto...',
  },
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

const PROSPECTOS_POR_DIA = 25;
