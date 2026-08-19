import { sql } from '@vercel/postgres';

async function main() {
  const hookA = '¿Sabes exactamente cuántos días de trabajo manual te separan de quemar a tu equipo?';
  const hookB = 'Pagar setters para mandar 200 DMs diarios genéricos es quemar dinero en 2026.';
  const hookC = 'Tu problema no es el volumen de leads, es la arquitectura de datos que usas para refinarlos.';
  const desarrollo = `Anoche revisé el sistema de adquisición de una consultora B2B top. Estaban enviando 1.500 correos semanales con una tasa de cierre ridícula.

El 80% de su base de datos era basura y el error clásico es intentar solucionarlo metiendo más setters a hacer tareas repetitivas.
Eso es automatización mediocre.

Nosotros conectamos una arquitectura de ingeniería de datos. Extrae, limpia, perfila y ejecuta una hiper-personalización algorítmica antes del primer mensaje.
Superamos los límites lógicos de scraping de LinkedIn sistemáticamente.

En dos semanas, su calendario se llenó de prospectos que ya conocían la solución antes de sentarse a hablar.
La diferencia entre jugar a ser una agencia y escalar de verdad está en la infraestructura técnica, no en meter más gente a picar piedra.

Ver la cara del cliente cuando los números finalmente cuadran sin fricción sigue siendo mi parte favorita.

¿Sigues dependiendo del outreach manual o ya tienes una verdadera refinería de datos? Hablemos por DM.`;

  await sql`
    INSERT INTO posts (fecha, pilar, hook_a, hook_b, hook_c, desarrollo, estado)
    VALUES (CURRENT_DATE, 'Sistemas de Prospección / Arquitectura (FlowNext)', ${hookA}, ${hookB}, ${hookC}, ${desarrollo}, 'Borrador')
  `;
  console.log('Post insertado correctamente en la base de datos.');
}

main().catch(console.error);
