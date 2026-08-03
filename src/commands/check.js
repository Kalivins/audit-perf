/**
 * Commande `check` : lit un fichier de cibles et montre ce qui en a ete
 * compris, sans emettre la moindre requete. Sert a valider une liste avant
 * de lancer un scan qui durera des heures.
 */

import { loadTargets } from '../input/targets.js';
import { renderTable } from '../report/table.js';
import { log, c } from '../util/log.js';
import { truncate } from '../util/format.js';

const DELIMITER_LABELS = {
  ',': 'virgule',
  ';': 'point-virgule',
  '\t': 'tabulation',
};

export async function runCheck(file, opts = {}) {
  const limit = opts.limit ? Number.parseInt(opts.limit, 10) : null;
  const { targets, rejected, delimiter, hasHeader } = await loadTargets(file, {
    limit: Number.isFinite(limit) ? limit : null,
  });

  log.blank();
  log.step(`Fichier ${c.bold(file)}`);
  log.info(
    `  separateur ${c.bold(DELIMITER_LABELS[delimiter] ?? delimiter)}` +
      `, en-tete ${hasHeader ? c.green('detecte') : c.yellow('absent')}`
  );
  log.blank();

  if (targets.length) {
    log.raw(
      renderTable(
        [
          { key: 'line', label: 'Ligne', align: 'right' },
          { key: 'name', label: 'Entreprise' },
          { key: 'url', label: 'URL' },
          { key: 'sector', label: 'Secteur' },
          { key: 'email', label: 'Email' },
          { key: 'traffic', label: 'Trafic/mois', align: 'right' },
        ],
        targets.map((t) => ({
          line: String(t.line),
          name: truncate(t.name, 34),
          url: truncate(t.url, 46),
          sector: t.sector ? truncate(t.sector, 20) : c.grey('-'),
          email: t.email ?? c.grey('-'),
          traffic: t.monthlyTraffic ? String(t.monthlyTraffic) : c.grey('-'),
        }))
      )
    );
    log.blank();
  }

  if (rejected.length) {
    log.warn(`${rejected.length} ligne(s) ecartee(s) :`);
    for (const row of rejected) {
      log.raw(
        `    ${c.grey(`ligne ${row.line}`)}  ${truncate(row.raw, 60)}  ${c.yellow(row.reason)}`
      );
    }
    log.blank();
  }

  const withEmail = targets.filter((t) => t.email).length;
  log.info(
    `  ${c.bold(String(targets.length))} cible(s) retenue(s)` +
      `, ${withEmail} avec email` +
      `, ${rejected.length} ecartee(s)`
  );
  log.blank();

  if (!targets.length) {
    log.error('Aucune cible exploitable dans ce fichier.');
    process.exitCode = 1;
  }
}
