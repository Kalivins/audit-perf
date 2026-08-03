/**
 * Commande `report` : regenere les sorties depuis le cache, sans rien
 * solliciter.
 *
 * Indispensable des qu'on retouche la presentation ou les textes clients :
 * on refait les rapports en une seconde au lieu de relancer des heures de
 * mesures, et les sites audites ne sont pas sollicites une deuxieme fois.
 */

import { createStore } from '../store/cache.js';
import { buildConfig } from '../config.js';
import { writeOutputs } from '../report/outputs.js';
import { log, c } from '../util/log.js';

export async function runReport(options = {}) {
  const config = buildConfig(options);
  const store = createStore(config.out);
  await store.init();

  const records = await store.all();
  if (!records.length) {
    log.error(`Aucun resultat dans ${config.out}. Lancez d'abord "audit scan".`);
    process.exitCode = 1;
    return;
  }

  log.blank();
  log.step(`Regeneration depuis ${c.bold(records.length.toString())} resultat(s) en cache`);

  const written = await writeOutputs(records, config, store);

  log.ok(`Rapports clients       ${c.bold(written.dossier)} (${written.rapports} fichiers)`);
  log.ok(`Liste de prospection   ${c.bold(written.csv.file)} (${written.csv.lignes} lignes)`);
  log.blank();
}
