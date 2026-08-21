/**
 * config.ts
 * Configuración central del sistema. Ninguna clave de API va aquí: eso vive en variables de
 * entorno de Vercel (ver .env.example y /ajustes).
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1';

export const PROSPECTOS_POR_DIA = 25;

// El ICP acepta cualquier idioma/país, pero al menos este número de los PROSPECTOS_POR_DIA
// elegidos cada día debe ser de España específicamente (ver engines/prospecting.ts) — el
// resto de huecos puede ser de cualquier otro sitio, sin restricción. Nunca se incluyen
// perfiles detectados como portugués/brasileño (exclusión total, no solo cuota).
export const MINIMO_ESPANA_POR_DIA = 15;

// País usado por defecto para sesgar una parte de la búsqueda de Apify hacia España cuando
// no se sobreescribe con APIFY_LOCATIONS (ver apify.ts).
export const UBICACION_PRIORITARIA = 'Spain';

// Formato aceptado como "perfil hiper validado": linkedin.com/in/... con slug no vacío.
export const LINKEDIN_URL_REGEX = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%À-ÿ]+\/?$/i;

// Perfil de cliente ideal (ICP). Se inyecta en todos los prompts.
export const ICP_DESCRIPTION = `
🎯 ICP: El "Independiente" B2B High-Ticket
1. Roles: Fundadores de micro-agencias (1-3 personas), Consultores B2B y Freelancers de Alto Valor (Media Buyers, Copywriters), Growth Partners / Fractional Executives.
2. Nichos: Agencias de Marketing Digital / Growth, Consultoría de Negocios y Ventas, Desarrolladores de Software a Medida / Automatizadores.
3. Sus clientes finales (a los que apuntan): E-commerces, marcas D2C, Negocios locales con alto LTV, Startups y Agencias B2B fácilmente identificables online.
4. Pain Points: Son su propio cuello de botella. Odian el trabajo manual ("de mono") de prospección. Quieren escalar sus ingresos sin el riesgo ni fricción de contratar a un SDR o asistente.
5. Nuestra Solución: Sistemas de IA para que hagan el "trabajo sucio" (extraer, filtrar, enviar mensajes) y ellos solo abran su calendario para ver reuniones agendadas. Quieren clonarse.
`.trim();

export interface ContentPillar {
  nombre: string;
  objetivo: string;
  ejemploAngulo: string;
}

// Pilares de contenido fijos. El motor de contenido rota entre ellos según el día del año.
export const CONTENT_PILLARS: ContentPillar[] = [
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

// Reglas de puntuación de prospectos.
export const SCORE_RULES = {
  BIO_KEYWORDS: 3, // bio menciona keywords clave del ICP (Growth Partner, Fractional, Solopreneur, etc.)
  ACTIVO_14_DIAS: 2, // publicó en los últimos 14 días
  SEGUIDORES_RANGO: 2, // entre 1.000 y 20.000 seguidores
  VENDE_PROGRAMAS: 1, // menciona que vende cursos, mentorías o programas
};

export const SCORE_KEYWORDS = [
  'growth partner', 
  'fractional', 
  'ayudo a', 
  'solopreneur', 
  'indie hacker', 
  'b2b consultant', 
  'consultor b2b', 
  'lead generation'
];
export const PROGRAMA_KEYWORDS = [
  'curso',
  'mentoría',
  'mentoria',
  'programa',
  'membresía',
  'membresia',
  'formación',
  'formacion',
];

export const BLACKLIST_KEYWORDS = [
  'futbol',
  'fútbol',
  'soccer',
  'deportivo',
  'deportiva',
  'entrenador personal',
  'personal trainer',
];
