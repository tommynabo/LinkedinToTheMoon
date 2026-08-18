import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../../../lib/db';
import type { ProspectoRow } from '../../../lib/types';

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { profileUrl, conversation } = body;

    if (!profileUrl || !conversation) {
      return NextResponse.json(
        { error: 'Profile URL and conversation data are required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'La clave de API de Anthropic no está configurada en el servidor (.env.local).' },
        { status: 500 }
      );
    }

    // Lookup the profile in the database
    const { rows } = await sql<ProspectoRow>`
      SELECT * FROM prospectos WHERE url_perfil = ${profileUrl} LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontró el perfil en la base de datos de prospectos. Verifica la URL.' },
        { status: 404 }
      );
    }

    const prospecto = rows[0];
    const profileContext = `
Nombre: ${prospecto.nombre}
Cargo: ${prospecto.cargo || 'N/D'}
Dato Personalizado (Extraído): ${prospecto.dato_personalizado || 'N/D'}
Último post: ${prospecto.ultimo_post_texto || 'N/D'}
Comentario Generado (Contexto): ${prospecto.comentario_post || 'N/D'}
Mensaje de Conexión (Contexto): ${prospecto.texto_mensaje || 'N/D'}
    `.trim();

    const systemPrompt = `Eres un Jefe de Ventas Elite de una agencia B2B altamente exitosa.
Tu objetivo es analizar el perfil de LinkedIn de un prospecto y el historial de una conversación, y redactar la respuesta PERFECTA para continuar la conversación, generar interés, derribar objeciones y guiar al prospecto hacia una llamada de ventas o el siguiente paso en el embudo.

Reglas para tu respuesta:
1. Sé conciso, profesional y persuasivo, pero mantén un tono conversacional y empático.
2. No suenes como un robot o una plantilla automatizada. Usa el contexto del perfil para personalizar la respuesta (menciona algo sobre su empresa, rol o experiencia de forma sutil).
3. Enfócate en aportar valor y generar curiosidad.
4. Termina con un "Call to Action" (CTA) claro, sencillo y de baja fricción (ej. una pregunta corta o una propuesta de valor rápida).
5. Devuelve ÚNICAMENTE el texto de la respuesta que se debe enviar, sin introducciones ni explicaciones adicionales.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Información del Perfil del Prospecto:\n${profileContext}\n\nHistorial de Conversación:\n${conversation}\n\nPor favor, redacta la respuesta de ventas ideal.`,
        },
      ],
    });

    // @ts-ignore - The types for Anthropic responses sometimes have varying text block definitions, safely extracting text:
    const responseText = message.content.map(block => block.type === 'text' ? block.text : '').join('');

    return NextResponse.json({ response: responseText });
  } catch (error: any) {
    console.error('Error in response-maker API:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor al procesar la solicitud' },
      { status: 500 }
    );
  }
}
