/**
 * types.ts
 * Tipos compartidos entre los motores, los clientes de API y las páginas.
 */

export interface ProspectoCrudo {
  nombre: string;
  url: string;
  cargo: string;
  empresa: string;
  bio: string;
  ultimoPostTema: string;
  ultimoPostFecha: string | null;
  seguidores: number | null;
}

export interface PostRow {
  id: number;
  fecha: string;
  pilar: string;
  hook_a: string | null;
  hook_b: string | null;
  hook_c: string | null;
  desarrollo: string | null;
  imagen_url: string | null;
  estado: string;
  link_publicado: string | null;
  likes_comentarios: number | null;
  created_at: string;
}

export interface ProspectoRow {
  id: number;
  fecha_extraccion: string;
  nombre: string;
  url_perfil: string;
  cargo: string | null;
  score: number;
  dato_personalizado: string | null;
  ultimo_post_texto: string | null;
  comentario_post: string | null;
  texto_mensaje: string | null;
  link_audio: string | null;
  estado: string;
  created_at: string;
}

export interface CrmRow {
  id: number;
  nombre: string | null;
  url_perfil: string;
  cargo: string | null;
  score: number | null;
  fecha_envio: string | null;
  acepto_conexion: boolean | null;
  respondio: boolean | null;
  se_agendo_llamada: boolean | null;
  se_convirtio_cliente: boolean | null;
  created_at: string;
}

export interface IdeaRow {
  id: number;
  idea: string;
  pilar_sugerido: string | null;
  usado: boolean;
  created_at: string;
}

export interface CronRunRow {
  id: number;
  ejecutado_en: string;
  resumen: string;
  hubo_error: boolean;
}
