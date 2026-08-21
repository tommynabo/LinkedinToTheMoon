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
Tu objetivo es analizar el perfil de LinkedIn de un prospecto y el historial de una conversación, y redactar la respuesta PERFECTA para continuar la conversación y guiar al prospecto hacia una llamada de ventas.

NOTA IMPORTANTE: El historial de la conversación es un "copy-paste" directo de LinkedIn con ruido (horas, nombres). Ignora la "basura" visual y enfócate exclusivamente en el hilo conductor.

Reglas para tu respuesta:
1. SÚPER CORTO: Tu respuesta debe tener máximo 1 solo párrafo y entre 5 a 7 frases cortas en total. NUNCA envíes párrafos largos.
2. Tono: Súper amigable, fresco y empático, pero directo al grano a vender. Nada de rodeos.
3. Ataca su punto de dolor o necesidad rápidamente y ofrece nuestros sistemas de prospección B2B de forma natural.
4. Termina con un Call to Action (CTA) claro, corto y directo (por ejemplo, agendar una llamada rápida).
5. Devuelve ÚNICAMENTE el texto de la respuesta que se debe enviar, sin introducciones, explicaciones ni comillas.`;

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
