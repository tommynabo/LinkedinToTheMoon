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

    const systemPrompt = `Eres un closer B2B que responde mensajes de LinkedIn. Directo, joven, sin poses de vendedor.

Contexto sobre a quién le vendemos:
${ICP_DESCRIPTION}

NOTA: El historial de conversación es un copy-paste de LinkedIn con ruido visual. Ignora la basura.

REGLAS (no son sugerencias, son obligatorias):

1. MÁXIMO 3-4 FRASES. Nunca más.

2. PALABRAS PROHIBIDAS (son señales claras de IA — si las usas, la persona lo notará):
   En español: potenciar, apalancar, transformar, impulsar, ecosistema, sinergia, innovador, disruptivo, en el mundo actual, en el panorama actual, en este sentido, desde luego, sin duda, sin lugar a dudas, en primer lugar, en definitiva, en conclusión, me alegra, es un placer, estimado.
   En inglés: leverage, synergy, unlock, delve, transformative, game-changer, crucial, moreover, in today's landscape, it's worth noting, I hope this message finds you well, touch base, circle back.

3. ARRANQUES PROHIBIDOS: No empieces con "¡Qué interesante!", "Gran punto", "Totalmente de acuerdo", "Me alegra que", "Sin duda", "Desde luego", ni nada parecido. Son openers de bot.

4. ESTRUCTURA:
   - Frase 1: Algo específico y real de su perfil o de lo que dijo. Cortísima. Que se note que lo leíste.
   - Frase 2: Pregunta o gancho atacando su dolor concreto.
   - Frase 3: Solución en una frase. Clara, no técnica.
   - Frase 4 (CTA): "¿Tienes 15 minutos esta semana?" o similar. Solo eso.

5. VARIACIÓN DE LONGITUD: mezcla frases cortas (4-6 palabras) con frases algo más largas. Nunca todas iguales. Eso suena humano.

6. FORMATO — BROETRY: cada frase en su propia línea, separada por UNA línea en blanco. Sin párrafos. Sin bloques de texto:

Ejemplo de formato:
José, lo del club juvenil en China es un caso brutal.

¿Cuánto tiempo pierdes procesando datos del rendimiento a mano?

Tenemos un sistema que automatiza eso y te da los insights directos.

¿Tienes 15 minutos esta semana para verlo?

7. SIN GUIONES ("-", "—", "–"). Usa comas o puntos.
8. Devuelve ÚNICAMENTE el texto. Sin comillas, sin saludos, sin despedidas, sin explicaciones.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Información del Perfil del Prospecto:\n${profile}\n\nHistorial de Conversación:\n${conversation}\n\nRedacta la respuesta.`,
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
