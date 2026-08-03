#!/usr/bin/env node
/**
 * Point d'entree CLI.
 *
 * Les modules lourds (Lighthouse, Chrome) sont importes dynamiquement dans les
 * actions : `audit --help` doit repondre instantanement et ne rien charger.
 */

import { Command } from 'commander';
import { VERSION } from '../src/config.js';
import { log, c, setLevel } from '../src/util/log.js';

const program = new Command();

program
  .name('audit')
  .description(
    "Audit de performance et de conformite pour sites de TPE/PME francaises.\n" +
      "Tout tourne en local : Lighthouse s'execute sur votre machine, aucune\n" +
      'donnee ne part vers un service tiers.'
  )
  .version(VERSION, '-V, --version', 'affiche la version')
  .helpOption('-h, --help', 'affiche cette aide')
  .option('--verbose', 'sortie detaillee (diagnostic)')
  .option('--quiet', 'sortie minimale (erreurs seulement)')
  .hook('preAction', (root) => {
    const opts = root.opts();
    if (opts.quiet) setLevel('error');
    else if (opts.verbose) setLevel('debug');
  });

program
  .command('check')
  .description('verifie la lecture d\'un fichier de cibles, sans rien scanner')
  .argument('<fichier>', 'fichier CSV ou TXT de cibles')
  .option('--limit <n>', 'ne retenir que les n premieres cibles valides')
  .action(async (file, opts) => {
    const { runCheck } = await import('../src/commands/check.js');
    await runCheck(file, opts);
  });

program.addHelpText(
  'after',
  `
${c.bold('Format du fichier de cibles')}
  Une ligne par entreprise :

    nom_entreprise,url,secteur,email,trafic_mensuel

  Seule l'URL est obligatoire. Le separateur peut etre une virgule, un
  point-virgule (export Excel francais) ou une tabulation, il est detecte
  automatiquement. L'en-tete est facultatif.

${c.bold('Exemples')}
  audit check examples/prospects-besancon.csv
  audit check ma-liste.csv --limit 20
`
);

program.parseAsync(process.argv).catch((error) => {
  log.error(error?.message || String(error));
  process.exitCode = 1;
});
