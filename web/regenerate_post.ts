import { config } from 'dotenv';
config();

import { ensureSchema, sql } from './src/lib/db';
import { generarPostDelDia } from './src/lib/engines/content';

async function main() {
  try {
    await ensureSchema();
    console.log('Schema ensured. Deleting today\'s draft...');
    
    // Delete today's draft post
    await sql`DELETE FROM posts WHERE fecha = CURRENT_DATE AND estado = 'Borrador'`;
    console.log("Deleted today's draft(s)");

    // Generate a new one
    console.log('Generating a new post for today with the updated short and direct rules...');
    const result = await generarPostDelDia();
    console.log('Generated new post:', result);
    
    process.exit(0);
  } catch (error) {
    console.error('Error during generation:', error);
    process.exit(1);
  }
}

main();
