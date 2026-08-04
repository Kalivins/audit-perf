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

program
  .command('scan')
  .description('analyse une liste de sites et ecrit les resultats')
  .argument('<fichier>', 'fichier CSV ou TXT de cibles')
  .option('-o, --out <dossier>', 'dossier de sortie', './out')
  .option('-q, --quick', 'phase HTTP seule, sans Lighthouse (balayage rapide)')
  .option('-c, --concurrency <n>', 'sites analyses en parallele (phase HTTP)', '8')
  .option(
    '--lh-concurrency <n>',
    'mesures Lighthouse en parallele. Au dela de 3 les temps se degradent',
    '2'
  )
  .option('--delay <ms>', 'delai minimal entre deux requetes vers un meme domaine', '2000')
  .option('--timeout <ms>', 'delai maximal par requete', '30000')
  .option('--strategies <liste>', 'mobile, desktop, ou les deux', 'mobile,desktop')
  .option('--limit <n>', 'ne traiter que les n premieres cibles')
  .option('--max-age <jours>', 'reanalyser au dela de cet age')
  .option('-f, --force', 'ignorer le cache et tout reanalyser')
  .option('--ignore-robots', 'passer outre le robots.txt (vos propres sites uniquement)')
  .option('--user-agent <chaine>', 'user-agent a annoncer')
  .option('--csv-delimiter <car>', 'separateur du CSV produit', ';')
  .option(
    '--crux',
    'ajouter les donnees de terrain Google (seule source d\'un INP reel). ' +
      'Necessite une cle d\'API, et ne repond que pour les sites a fort trafic'
  )
  .option('--crux-key <cle>', 'cle d\'API CrUX, sinon variable CRUX_API_KEY')
  .action(async (file, opts) => {
    const { runScan } = await import('../src/commands/scan.js');
    await runScan(file, opts);
  });

program
  .command('report')
  .description('regenere les sorties depuis le cache, sans rien solliciter')
  .option('-o, --out <dossier>', 'dossier de sortie', './out')
  .option('--csv-delimiter <car>', 'separateur du CSV produit', ';')
  .action(async (opts) => {
    const { runReport } = await import('../src/commands/report.js');
    await runReport(opts);
  });

program
  .command('serve')
  .description('ouvre les rapports dans un navigateur, via un serveur local')
  .option('-o, --out <dossier>', 'dossier de sortie a servir', './out')
  .option('-p, --port <n>', 'port d\'ecoute', '4173')
  .action(async (opts) => {
    const { runServe } = await import('../src/commands/serve.js');
    await runServe(opts);
  });

program
  .command('list')
  .description('reaffiche la synthese depuis le cache, sans rien solliciter')
  .option('-o, --out <dossier>', 'dossier de sortie', './out')
  .action(async (opts) => {
    const { runList } = await import('../src/commands/list.js');
    await runList(opts);
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

${c.bold('Deux temps, deux usages')}
  Le balayage rapide ne fait qu'une requete par site et traite quelques
  centaines d'entreprises en quelques minutes. Il sert a reperer qui vaut la
  peine. L'analyse complete lance Lighthouse et prend une a deux minutes par
  site : on la reserve aux cibles retenues.

    audit scan prospects.csv --quick          # balayage large
    audit scan retenus.csv                    # analyse complete

${c.bold('Exemples')}
  audit check examples/prospects-besancon.csv
  audit scan examples/prospects-besancon.csv --quick
  audit scan examples/prospects-besancon.csv --limit 4
  audit list
`
);

program.parseAsync(process.argv).catch((error) => {
  log.error(error?.message || String(error));
  process.exitCode = 1;
});
