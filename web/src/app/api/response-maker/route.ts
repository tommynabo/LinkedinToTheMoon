import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ICP_DESCRIPTION } from '../../../lib/config';

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { profile, conversation } = body;

    if (!profile || !conversation) {
      return NextResponse.json(
        { error: 'Profile and conversation data are required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'La clave de API de Anthropic no está configurada en el servidor (.env.local).' },
        { status: 500 }
      );
    }

    const systemPrompt = `Eres un Closer de Ventas Elite de una agencia B2B moderna y exitosa.
Tu objetivo es analizar el perfil de LinkedIn de un prospecto y el historial de una conversación, y redactar la respuesta PERFECTA para continuar la conversación y guiar al prospecto hacia una llamada.

Contexto sobre nuestro Cliente Ideal (A quién le vendemos):
${ICP_DESCRIPTION}

NOTA IMPORTANTE: El historial de la conversación es un "copy-paste" directo de LinkedIn con ruido. Ignora la "basura" visual.

Reglas para tu respuesta:
1. EXTREMADAMENTE DIRECTO Y CORTO: NUNCA generes respuestas largas ni tochos de texto. Tu respuesta debe ser de 2 párrafos muy breves, máximo 4-5 líneas en total.
2. Tono: Amigable, directo, joven, con respeto, equilibrado. No suenes a vendedor tradicional pesado.
3. Estructura ideal:
   - Párrafo 1: Reconocimiento rápido y personalizado sobre su perfil (ej: "José, tus cartas de opinión son oro puro..."). Seguido INMEDIATAMENTE de una pregunta directa atacando su DOLOR PERSONAL (ej: "¿cuánto tiempo dedicas a prospectar? Ese suele ser el gran cuello de botella.").
   - Párrafo 2: Nuestra solución al grano ("Tenemos un sistema que automatiza esto, te entrega llamadas agendadas") y un Call to Action (CTA) simple, suave y de bajo compromiso ("¿Te animas a ver cómo funciona en 15 minutos?").
4. Devuelve ÚNICAMENTE el texto de la respuesta, sin saludos formales innecesarios, sin despedidas formales, sin introducciones, sin explicaciones ni comillas.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Información del Perfil del Prospecto:\n${profile}\n\nHistorial de Conversación:\n${conversation}\n\nPor favor, redacta la respuesta de ventas ideal.`,
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
