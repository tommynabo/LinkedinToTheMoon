/**
 * config.ts
 * Configuración central del sistema. Ninguna clave de API va aquí: eso vive en variables de
 * entorno de Vercel (ver .env.example y /ajustes).
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
export const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1';

export const PROSPECTOS_POR_DIA = 25;

// Formato aceptado como "perfil hiper validado": linkedin.com/in/... con slug no vacío.
export const LINKEDIN_URL_REGEX = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%À-ÿ]+\/?$/i;

// Perfil de cliente ideal (ICP). Se inyecta en todos los prompts.
export const ICP_DESCRIPTION = `
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

export interface ContentPillar {
  nombre: string;
  objetivo: string;
  ejemploAngulo: string;
}

// Pilares de contenido fijos. El motor de contenido rota entre ellos según el día del año.
export const CONTENT_PILLARS: ContentPillar[] = [
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

// Reglas de puntuación de prospectos.
export const SCORE_RULES = {
  BIO_KEYWORDS: 3, // bio menciona "coach", "consultor", "mentor", "fundador de comunidad"
  ACTIVO_14_DIAS: 2, // publicó en los últimos 14 días
  SEGUIDORES_RANGO: 2, // entre 1.000 y 20.000 seguidores
  VENDE_PROGRAMAS: 1, // menciona que vende cursos, mentorías o programas
};

export const SCORE_KEYWORDS = ['coach', 'consultor', 'consultora', 'mentor', 'mentora', 'fundador de', 'fundadora de'];
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
