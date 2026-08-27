import { config } from 'dotenv';
config();

import { ensureSchema, sql } from './src/lib/db';
import { buscarUltimosPosts, buscarProspectosConApify } from './src/lib/apify';
import { normalizeLinkedInUrl, esProspectoValido } from './src/lib/validation';
import { getUrlsConocidas, calcularScore } from './src/lib/scoring';
import { esDeEspana, detectarIdiomaAprox } from './src/lib/idioma';
import { personalizarMensajesYAudios } from './src/lib/engines/personalization';

async function main() {
  await ensureSchema();
  
  // 1. Get current pending prospects
  const { rows: pendings } = await sql`SELECT id, nombre, url_perfil, ultimo_post_texto FROM prospectos WHERE estado = 'Pendiente'`;
  const totalTarget = pendings.length;
  
  console.log(`Checking ${totalTarget} pending prospects for old posts...`);
  
  const urls = pendings.map(p => p.url_perfil);
  const postsMap = new Map();
  
  const chunkSize = 15;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const res = await buscarUltimosPosts(chunk);
    for (const [k, v] of res.entries()) {
      postsMap.set(k, v);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  const haceUnMes = new Date();
  haceUnMes.setMonth(haceUnMes.getMonth() - 1);
  const unMesMs = haceUnMes.getTime();

  function esPostReciente(fechaStr: string | null | undefined): boolean {
    if (!fechaStr) return true;
    const fecha = new Date(fechaStr).getTime();
    return fecha >= unMesMs;
  }

  const idsToDelete: number[] = [];
  
  for (const p of pendings) {
    const urlNorm = normalizeLinkedInUrl(p.url_perfil);
    const postInfo = postsMap.get(urlNorm);
    
    if (postInfo && postInfo.fecha) {
      if (!esPostReciente(postInfo.fecha)) {
        console.log(`Post for ${p.nombre} is too old: ${postInfo.fecha}. Marking for deletion.`);
        idsToDelete.push(p.id);
      }
    }
  }
  
  if (idsToDelete.length > 0) {
    console.log(`Deleting ${idsToDelete.length} prospects with posts older than 1 month...`);
    await sql`DELETE FROM prospectos WHERE id = ANY(${idsToDelete})`;
  } else {
    console.log('All current prospects have recent posts!');
  }
  
  const missingCount = idsToDelete.length;
  
  if (missingCount > 0) {
    console.log(`We need to find ${missingCount} new prospects WITH RECENT POSTS to replace them.`);
    
    console.log('Fetching candidates from Apify...');
    const candidatosBrutos = await buscarProspectosConApify();
    const validos = candidatosBrutos.filter(esProspectoValido);
    const urlsConocidas = await getUrlsConocidas();
    
    const candidatosNoConocidos = validos.filter(p => !urlsConocidas.has(normalizeLinkedInUrl(p.url)));
    console.log(`Found ${candidatosNoConocidos.length} valid and unknown candidates.`);
    
    const scored = candidatosNoConocidos.map(p => ({
      prospecto: p,
      score: calcularScore(p),
      esEspana: esDeEspana(p.url, `${p.cargo} ${p.bio}`),
      idioma: detectarIdiomaAprox(`${p.cargo} ${p.bio}`)
    })).filter(c => c.idioma !== 'pt');
    
    scored.sort((a, b) => b.score - a.score);
    
    const elegidos = [];
    let i = 0;
    
    while (elegidos.length < missingCount && i < scored.length) {
      const candidateBatch = scored.slice(i, i + chunkSize);
      i += chunkSize;
      
      const urlsBatch = candidateBatch.map(c => c.prospecto.url);
      const postsRes = await buscarUltimosPosts(urlsBatch);
      
      for (const c of candidateBatch) {
        const normUrl = normalizeLinkedInUrl(c.prospecto.url);
        const postInfo = postsRes.get(normUrl);
        const finalPostText = c.prospecto.ultimoPostTema || (postInfo?.texto) || null;
        
        if (finalPostText) {
          const fechaPost = postInfo?.fecha || c.prospecto.ultimoPostFecha || null;
          if (esPostReciente(fechaPost)) {
            elegidos.push({
              ...c,
              postEncontrado: {
                texto: finalPostText,
                url: postInfo?.url || null
              }
            });
            if (elegidos.length >= missingCount) break;
          }
        }
      }
    }
    
    console.log(`Found ${elegidos.length} new prospects with recent posts.`);
    
    for (const eleg of elegidos) {
      const p = eleg.prospecto;
      const normUrl = normalizeLinkedInUrl(p.url);
      
      await sql`
        INSERT INTO prospectos (fecha_extraccion, nombre, url_perfil, cargo, score, dato_personalizado, ultimo_post_texto, ultimo_post_url, estado)
        VALUES (CURRENT_DATE, ${p.nombre}, ${p.url}, ${p.cargo}, ${eleg.score + 1000},
                ${p.bio || null}, ${eleg.postEncontrado.texto}, ${eleg.postEncontrado.url}, 'Pendiente')
      `;

      await sql`
        INSERT INTO historico_urls (url_perfil)
        VALUES (${normUrl})
        ON CONFLICT (url_perfil) DO NOTHING
      `;
    }
    
    console.log(`Inserted ${elegidos.length} new prospects into the database.`);
  }

  console.log('Generating personalized comments and messages for all pending leads...');
  const res = await personalizarMensajesYAudios();
  console.log(`Generated ${res.generados} comments/messages.`);
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
