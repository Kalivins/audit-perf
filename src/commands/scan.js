/**
 * Commande `scan` : lit une liste, analyse, ecrit les resultats, affiche la
 * synthese triee.
 */

import { loadTargets } from '../input/targets.js';
import { buildConfig, LH_CONCURRENCY_WARN } from '../config.js';
import { createStore } from '../store/cache.js';
import { runBatch } from '../audit/runner.js';
import { renderSummary, renderCounts, renderLegend } from '../report/console.js';
import { log, c, progress } from '../util/log.js';
import { truncate } from '../util/format.js';

export async function runScan(file, options = {}) {
  const config = buildConfig(options);

  const { targets, rejected } = await loadTargets(file, { limit: config.limit });
  if (!targets.length) {
    log.error(`Aucune cible exploitable dans ${file}.`);
    process.exitCode = 1;
    return;
  }

  if (rejected.length) {
    log.warn(
      `${rejected.length} ligne(s) ecartee(s) a la lecture. ` +
        `Utilisez "audit check ${file}" pour le detail.`
    );
  }

  if (!config.quick) {
    // Import differe : Lighthouse est lourd a charger, et le mode rapide n'en
    // a aucun besoin.
    const { checkChromeAvailable } = await import('../audit/lighthouse.js');
    const chrome = await checkChromeAvailable();
    if (!chrome.ok) {
      log.error(
        'Google Chrome est introuvable, Lighthouse ne peut pas demarrer.\n' +
          '  Installez Chrome, ou relancez avec --quick pour la seule phase HTTP.'
      );
      process.exitCode = 1;
      return;
    }
    if (config.lhConcurrency > LH_CONCURRENCY_WARN) {
      log.warn(
        `Concurrence Lighthouse a ${config.lhConcurrency}. Au dela de ` +
          `${LH_CONCURRENCY_WARN}, les instances se disputent le processeur et ` +
          'les temps mesures deviennent comparatifs plutot qu\'absolus.'
      );
    }
  }

  const store = createStore(config.out);
  await store.init();
  await store.sweep();

  log.blank();
  log.step(
    `${c.bold(String(targets.length))} cible(s), ` +
      `${config.quick ? 'phase HTTP seule' : `profils ${config.strategies.join(' et ')}`}, ` +
      `concurrence ${config.concurrency}${config.quick ? '' : `/${config.lhConcurrency}`}, ` +
      `delai ${config.delay} ms par domaine`
  );
  if (config.ignoreRobots) {
    log.warn('robots.txt ignore par --ignore-robots. A n\'utiliser que sur vos propres sites.');
  }
  log.blank();

  const bar = progress(targets.length, 'analyses');
  let depuisCache = 0;

  const records = await runBatch(targets, config, {
    store,
    onEvent(event) {
      if (event.type === 'cache') {
        depuisCache += 1;
        bar.tick(`${truncate(event.target.name, 30)} (deja en cache)`);
      } else if (event.type === 'done') {
        bar.tick(truncate(event.target.name, 40));
      } else if (event.type === 'error') {
        bar.tick(`${truncate(event.target.name, 30)} : ${event.error}`);
      } else if (event.type === 'quick') {
        log.debug(`${event.target.url} phase 1 : ${event.status}`);
      } else if (event.type === 'lighthouse') {
        log.debug(`${event.target.url} ${event.strategy} : ${event.ok ? 'ok' : 'echec'}`);
      }
    },
  });

  bar.done();

  log.blank();
  log.raw(renderSummary(records));
  log.blank();
  log.raw(renderCounts(records));
  if (depuisCache) {
    log.raw(c.grey(`  ${depuisCache} resultat(s) repris du cache. --force pour tout refaire.`));
  }
  log.blank();
  log.raw(renderLegend());
  log.blank();

  const { writeOutputs } = await import('../report/outputs.js');
  const written = await writeOutputs(records, config, store);

  log.ok(`Resultats bruts   ${c.bold(store.dirs.raw)}`);
  log.ok(`Liste de prospection   ${c.bold(written.csv.file)} (${written.csv.lignes} lignes)`);
  log.blank();
}
