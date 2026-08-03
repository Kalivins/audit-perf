/**
 * Production des fichiers de sortie.
 *
 * Regroupe au meme endroit ce que produisent `scan` et `report`, pour que
 * regenerer les sorties depuis le cache donne exactement le meme resultat
 * qu'un scan complet.
 */

import path from 'node:path';
import { writeProspectCsv } from './csv.js';

export async function writeOutputs(records, config, store) {
  const csv = await writeProspectCsv(
    records,
    path.join(config.out, 'prospection.csv'),
    { delimiter: config.csvDelimiter }
  );

  return { csv };
}
