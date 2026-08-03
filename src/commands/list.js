/**
 * Commande `list` : reaffiche la synthese depuis le cache, sans rien solliciter.
 */

import { createStore } from '../store/cache.js';
import { renderSummary, renderCounts, renderLegend } from '../report/console.js';
import { log, c } from '../util/log.js';
import { DEFAULTS } from '../config.js';

export async function runList(options = {}) {
  const out = options.out || DEFAULTS.out;
  const store = createStore(out);
  const records = await store.all();

  if (!records.length) {
    log.error(`Aucun resultat dans ${out}. Lancez d'abord "audit scan".`);
    process.exitCode = 1;
    return;
  }

  log.blank();
  log.raw(renderSummary(records));
  log.blank();
  log.raw(renderCounts(records));
  log.blank();
  log.raw(renderLegend());
  log.blank();
  log.info(c.grey(`  Source : ${store.dirs.raw}`));
  log.blank();
}
