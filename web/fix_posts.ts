import { config } from 'dotenv';
config();

import { ensureSchema, sql } from './src/lib/db';
import { buscarUltimosPosts, buscarProspectosConApify } from './src/lib/apify';
import { normalizeLinkedInUrl, esProspectoValido } from './src/lib/validation';
import { getUrlsConocidas, calcularScore } from './src/lib/scoring';
import { esDeEspana, detectarIdiomaAprox } from './src/lib/idioma';

async function main() {
  await ensureSchema();
  
  // 1. Get current pending prospects
  const { rows: pendings } = await sql`SELECT id, nombre, url_perfil, ultimo_post_texto FROM prospectos WHERE estado = 'Pendiente'`;
  const totalTarget = pendings.length;
  
  console.log(`Currently there are ${totalTarget} pending prospects.`);
  
  const withoutPosts = pendings.filter(p => !p.ultimo_post_texto);
  console.log(`Of those, ${withoutPosts.length} do not have a post.`);
  
  if (withoutPosts.length > 0) {
    console.log('Trying to fetch posts for them again (now including reposts)...');
    
    // Process in chunks to avoid rate limits
    const urls = withoutPosts.map(p => p.url_perfil);
    const newPostsMap = new Map();
    
    const chunkSize = 15;
    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      const res = await buscarUltimosPosts(chunk);
      for (const [k, v] of res.entries()) {
        newPostsMap.set(k, v);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    let recoveredCount = 0;
    const idsToDelete: number[] = [];
    
    for (const p of withoutPosts) {
      const urlNorm = normalizeLinkedInUrl(p.url_perfil);
      const postInfo = newPostsMap.get(urlNorm);
      
      if (postInfo && postInfo.texto) {
        console.log(`Recovered post for ${p.nombre}: ${postInfo.texto.substring(0, 30)}...`);
        await sql`UPDATE prospectos SET ultimo_post_texto = ${postInfo.texto}, ultimo_post_url = ${postInfo.url} WHERE id = ${p.id}`;
        recoveredCount++;
      } else {
        idsToDelete.push(p.id);
      }
    }
    
    console.log(`Recovered posts for ${recoveredCount} prospects.`);
    
    if (idsToDelete.length > 0) {
      console.log(`Deleting ${idsToDelete.length} prospects that still have no posts...`);
      await sql`DELETE FROM prospectos WHERE id = ANY(${idsToDelete})`;
    }
    
    const remainingCount = totalTarget - idsToDelete.length;
    console.log(`Remaining valid prospects: ${remainingCount}`);
    
    const missingCount = totalTarget - remainingCount;
    
    if (missingCount > 0) {
      console.log(`We need to find ${missingCount} new prospects WITH POSTS to reach the original total of ${totalTarget}.`);
      
      // Fetch new ones
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
      
      // Sort by score
      scored.sort((a, b) => b.score - a.score);
      
      // We need missingCount. Let's process top scored candidates until we find enough with posts.
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
      
      console.log(`Found ${elegidos.length} new prospects with posts.`);
      
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
  } else {
    console.log('All current prospects already have posts!');
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
