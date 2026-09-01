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
1. EXTREMADAMENTE DIRECTO Y CORTO: Máximo 3-4 frases en total. NUNCA generes respuestas largas.
2. Tono: Amigable, directo, joven, con respeto. No suenes a vendedor tradicional pesado.
3. Estructura obligatoria:
   - Frase 1: Reconocimiento hiper-personalizado sobre su perfil (ej: "José, tu club juvenil en China es el laboratorio ideal para conectar datos y rendimiento.").
   - Frase 2: Pregunta directa atacando su dolor (ej: "¿Cuánto tiempo pierdes hoy procesando datos manualmente?").
   - Frase 3: Solución rápida y directa (ej: "Tenemos un sistema que automatiza todo ese proceso y entrega insights directos.").
   - Frase 4 (CTA): Cierre directo y suave (ej: "¿Tienes 15 minutos para verlo en acción?").
4. FORMATO OBLIGATORIO — BROETRY: escribe cada frase en su propia línea, separada por UNA línea en blanco de la siguiente. Sin párrafos largos. Sin bloques de texto. Igual que este ejemplo:

---EJEMPLO DE FORMATO CORRECTO---
José, vi que llevas años construyendo comunidad alrededor del deporte de base.

Eso es exactamente el tipo de operación donde nuestros sistemas generan más impacto.

Construimos arquitecturas de datos B2B que automatizan la prospección y el análisis de rendimiento a escala.

¿Tienes 15 minutos esta semana para verlo en acción?
---FIN DEL EJEMPLO---

5. PROHIBICIÓN ABSOLUTA: PROHIBIDO usar guiones (como "-", "—" o "–") en el texto. Usa comas o puntos en su lugar.
6. Devuelve ÚNICAMENTE el texto de la respuesta en ese formato, sin saludos formales innecesarios, sin despedidas formales, sin introducciones, sin explicaciones ni comillas.`;

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
