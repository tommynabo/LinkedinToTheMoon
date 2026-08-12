/**
 * blob.ts
 * Sube archivos binarios (audio, imágenes) a Vercel Blob y devuelve la URL pública.
 */
import { put } from '@vercel/blob';

export async function subirArchivo(nombre: string, datos: Buffer, contentType: string): Promise<string> {
  const blob = await put(nombre, datos, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}
