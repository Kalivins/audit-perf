/**
 * Orchestration du lot.
 *
 * Chaque cible traverse le pipeline pour son propre compte : elle passe en
 * phase Lighthouse des que sa phase 1 est finie, sans attendre que tout le
 * lot ait termine la premiere etape. Une barriere entre les deux phases
 * ferait patienter les sites rapides derriere le plus lent du lot.
 *
 * Deux limites de concurrence distinctes, et c'est le point important : la
 * phase 1 ne fait qu'une requete et supporte le parallelisme, alors que
 * Lighthouse mesure des temps et fausse ses propres resultats des que
 * plusieurs instances se disputent le processeur.
 */

import pLimit from 'p-limit';
import { createScheduler, hostOf } from '../net/politeness.js';
import { createRobotsCache } from '../net/robots.js';
import { runQuickAudit, STATUS } from './quick.js';
import { consolidate } from '../score/findings.js';
import { estimateGains } from '../score/gains.js';
import { prospectScore, hook } from '../score/prospect.js';
import { USER_AGENT_TOKEN } from '../config.js';
import { ERRORS } from '../net/http.js';

/**
 * Statuts pour lesquels lancer un navigateur a un sens. Un domaine mort ou une
 * erreur serveur ne donneront rien de plus a Lighthouse. Une page vide, si :
 * seul un vrai navigateur peut dire si le contenu arrive par JavaScript.
 */
const MESURABLE = new Set([STATUS.OK, STATUS.EMPTY]);

export async function runBatch(targets, config, { store, onEvent = () => {} } = {}) {
  const scheduler = createScheduler({ delay: config.delay });
  const robots = createRobotsCache({
    userAgent: config.userAgent,
    userAgentToken: USER_AGENT_TOKEN,
    timeout: config.timeout,
    ignore: config.ignoreRobots,
    scheduler,
  });

  const quickLimit = pLimit(config.concurrency);
  const lhLimit = pLimit(config.lhConcurrency);

  async function measure(target, quick) {
    // Charge a la demande : le mode rapide ne doit pas payer ce chargement.
    const { runLighthouseIsolated } = await import('./lh-runner.js');
    const lighthouse = {};
    const host = hostOf(target.url);
    // On mesure l'adresse reellement servie : inutile de faire refaire a
    // Lighthouse une redirection deja constatee.
    const url = quick.page?.url || target.url;

    for (const strategy of config.strategies) {
      const run = await lhLimit(() =>
        scheduler.run(host, () =>
          runLighthouseIsolated(url, {
            strategy,
            timeout: config.timeout * 4,
            debug: config.debug,
          })
        )
      );
      lighthouse[strategy] = run.ok ? run.data : { strategy, erreur: run.error };
      onEvent({ type: 'lighthouse', target, strategy, ok: run.ok, erreur: run.error });
    }
    return lighthouse;
  }

  async function process(target) {
    const cached = await store?.cached(target.id, {
      force: config.force,
      maxAge: config.maxAge,
    });
    if (cached) {
      onEvent({ type: 'cache', target, record: cached });
      return cached;
    }

    const quick = await quickLimit(() =>
      runQuickAudit(target, { scheduler, robots, config })
    );
    onEvent({ type: 'quick', target, status: quick.status });

    let lighthouse = {};
    if (!config.quick && MESURABLE.has(quick.status)) {
      lighthouse = await measure(target, quick);
    }

    // Donnees de terrain, seule source d'un INP reel. Optionnelles, muettes en
    // cas d'echec, et sans effet sur le deroulement du lot.
    let terrain = null;
    if (config.crux && config.cruxKey && MESURABLE.has(quick.status)) {
      const { fetchFieldData } = await import('./crux.js');
      terrain = await fetchFieldData(quick.page?.url || target.url, {
        key: config.cruxKey,
        strategy: config.strategies[0] ?? 'mobile',
        timeout: config.timeout,
      });
      onEvent({ type: 'crux', target, disponible: terrain.disponible });
    }

    // Profil retenu pour les constats : le mobile d'abord, parce que c'est
    // la realite des visiteurs d'une TPE. Le bureau ne sert qu'a la
    // comparaison affichee dans le rapport.
    const retenu =
      config.strategies
        .map((s) => lighthouse[s])
        .find((r) => r && !r.erreur) ?? null;

    const consolidated = await consolidate({ quick, lh: retenu });
    const gains = estimateGains({
      lh: retenu,
      findings: consolidated.findings,
      target,
    });
    const prospect = prospectScore({ lh: retenu, consolidated });

    const record = {
      target,
      status: quick.status,
      detail: quick.detail,
      quick: {
        summary: quick.summary,
        page: quick.page,
      },
      lighthouse,
      terrain,
      profilRetenu: retenu?.strategy ?? null,
      consolidated,
      gains,
      prospect: { ...prospect, accroche: hook({ consolidated, lh: retenu }) },
      checkedAt: new Date().toISOString(),
    };

    await store?.save(record);
    onEvent({ type: 'done', target, record });
    return record;
  }

  // Chaque cible est isolee : un plantage imprevu sur un site ne doit jamais
  // emporter le lot entier.
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        return await process(target);
      } catch (error) {
        const record = {
          target,
          status: ERRORS.NETWORK,
          detail: error?.message || String(error),
          quick: null,
          lighthouse: {},
          consolidated: { findings: [], top: [], parPalier: {}, inconnus: [] },
          gains: null,
          prospect: { score: 0, partiel: true, detail: {}, accroche: null },
          checkedAt: new Date().toISOString(),
        };
        onEvent({ type: 'error', target, error: record.detail });
        await store?.save(record).catch(() => {});
        return record;
      }
    })
  );

  return results;
}
