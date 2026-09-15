import { config } from 'dotenv';

config();

import { previsualizarPost } from '../src/lib/engines/content';

const type = process.argv[2] === 'actualidad' ? 'actualidad' : 'tecnico';

previsualizarPost(type)
  .then((preview) => console.log(JSON.stringify(preview, null, 2)))
  .catch((error) => {
    console.error('No se pudo generar la previsualización:', error);
    process.exitCode = 1;
  });