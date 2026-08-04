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
import { estimateGains } from '../score/gains.js';
import { prospectScore, hook } from '../score/prospect.js';

/** Reconstruit tout ce qui depend du code et des textes, pas des mesures. */
async function rafraichir(record) {
  if (!record.consolidated?.findings?.length) return record;

  // Le resume technique est un libelle, pas une mesure : on le reconstruit
  // depuis la liste des technologies detectees.
  const stock = record.quick?.summary?.stack;
  const quick = stock?.tout
    ? {
        ...record.quick,
        summary: {
          ...record.quick.summary,
          stack: { ...stock, resume: resumeStack(stock.tout) },
        },
      }
    : record.quick;

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
  const frais = [];

  for (const record of records) {
    const actualise = await rafraichir(record);
    frais.push(actualise);

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
