import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

    const systemPrompt = `Eres un Jefe de Ventas Elite de una agencia B2B altamente exitosa.
Tu objetivo es analizar el perfil de LinkedIn de un prospecto y el historial de una conversación, y redactar la respuesta PERFECTA para continuar la conversación, generar interés, derribar objeciones y guiar al prospecto hacia una llamada de ventas o el siguiente paso en el embudo.

NOTA IMPORTANTE: El historial de la conversación es un "copy-paste" directo de LinkedIn. Verás horas aleatorias (ej. 12:45 PM), nombres de perfiles que se repiten y emojis seguidos. Debes ignorar por completo toda esta "basura" visual y enfocarte pura y exclusivamente en el hilo conductor de la conversación y el mensaje real.

Reglas para tu respuesta:
1. Sé directo, asertivo y ve directo al grano. Nada de rodeos ni falsas simpatías.
2. Usa el contexto del perfil y de la conversación EXCLUSIVAMENTE para entender su punto de dolor o necesidad y atacar con la venta de forma precisa.
3. El objetivo es llevar la conversación donde queremos para forzar un "sí" o un "no" final. Ofrece nuestros sistemas de prospección B2B y arquitectura de datos de forma directa.
4. Termina con un "Call to Action" (CTA) contundente y directo a la venta (por ejemplo, agendar una llamada). Nada de preguntas abiertas para charlar.
5. Devuelve ÚNICAMENTE el texto de la respuesta que se debe enviar, sin introducciones ni explicaciones adicionales.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
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
