/**
 * Production des fichiers de sortie.
 *
 * Regroupe ce que produisent `scan` et `report`. Les textes francais et les
 * estimations sont recalcules ici a partir des mesures en cache, jamais repris
 * tels qu'ils avaient ete ecrits : corriger une formulation dans data/copy ou
 * une ponderation dans rules.js doit se voir au prochain `report`, sans
 * relancer la moindre mesure.
 */

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { writeProspectCsv } from './csv.js';
import { buildReport } from './html.js';
import { buildIndex } from './index.js';
import { STATUS_LABELS } from '../audit/quick.js';
import { reconsolidate } from '../score/findings.js';
import { resumeStack } from '../audit/checks/stack.js';
import { libellerCapacites } from '../audit/checks/automation.js';
import { classerParSecteur } from '../score/comparaison.js';
import { estimateGains } from '../score/gains.js';
import { prospectScore, hook } from '../score/prospect.js';

/**
 * Reconstruit les libelles derives du resume de la phase 1.
 *
 * Le resume technique et les intitules de dispositifs sont des textes, pas des
 * mesures : ils atteignent le rapport client et doivent pouvoir etre corriges
 * sans relancer une seule mesure. Toujours par copie, jamais en place :
 * l'enregistrement d'origine reste ce qui a ete mesure.
 */
async function rafraichirLibelles(quick) {
  if (!quick?.summary) return quick;

  const summary = { ...quick.summary };

  if (summary.stack?.tout) {
    summary.stack = { ...summary.stack, resume: resumeStack(summary.stack.tout) };
  }

  const auto = summary.automatisation;
  if (auto) {
    summary.automatisation = {
      ...auto,
      en_place: await libellerCapacites(auto.capacites ?? []),
      manquants_libelles: await libellerCapacites(auto.manquants ?? []),
      trompeurs: await Promise.all(
        (auto.trompeurs ?? []).map(async (t) => ({
          ...t,
          libelle: (await libellerCapacites([t.capacite]))[0],
        }))
      ),
    };
  }

  return { ...quick, summary };
}

/** Reconstruit tout ce qui depend du code et des textes, pas des mesures. */
async function rafraichir(record) {
  if (!record.consolidated?.findings?.length) return record;

  const quick = await rafraichirLibelles(record.quick);
  const lh = record.lighthouse?.[record.profilRetenu] ?? null;
  const consolidated = await reconsolidate(record);
  const gains = estimateGains({
    lh,
    findings: consolidated.findings,
    target: record.target,
  });
  const prospect = prospectScore({ lh, consolidated });

  return {
    ...record,
    quick,
    consolidated,
    gains,
    prospect: { ...prospect, accroche: hook({ consolidated, lh }) },
  };
}

export async function writeOutputs(records, config, store) {
  const reports = new Map();

  // Deux passes : le classement entre confreres a besoin de tout le lot avant
  // qu'un seul rapport puisse etre ecrit.
  const rafraichis = [];
  for (const record of records) rafraichis.push(await rafraichir(record));
  const classement = classerParSecteur(rafraichis);

  const frais = rafraichis.map((record) => ({
    ...record,
    comparaison: classement.get(record.target.id) ?? null,
  }));

  for (const actualise of frais) {
    const fichier = path.join(store.dirs.reports, `${actualise.target.slug}.html`);
    const html = buildReport(actualise, {
      statusLabel: STATUS_LABELS[actualise.status] ?? actualise.status,
    });
    await writeFile(fichier, html, 'utf8');
    reports.set(actualise.target.id, path.relative(config.out, fichier));
  }

  const csv = await writeProspectCsv(
    frais,
    path.join(config.out, 'prospection.csv'),
    { delimiter: config.csvDelimiter, reports }
  );

  // Page d'entree : seize fichiers dans un dossier ne se parcourent pas.
  const index = path.join(config.out, 'index.html');
  await writeFile(index, buildIndex(frais, reports), 'utf8');

  return { csv, index, rapports: reports.size, dossier: store.dirs.reports };
}
