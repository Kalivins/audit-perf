#!/usr/bin/env node
/**
 * Processus fils : une mesure Lighthouse, puis extinction.
 *
 * Volontairement minimal. Il recoit ses parametres en JSON sur la ligne de
 * commande, ecrit le resultat deja depouille dans un fichier, et s'arrete.
 * Le rapport Lighthouse complet pese plusieurs megaoctets : le depouiller ici
 * evite de le faire transiter entre les processus.
 */

import { writeFile } from 'node:fs/promises';
import { runLighthouse } from './lighthouse.js';
import { readLighthouse } from './vitals.js';

async function main() {
  const params = JSON.parse(process.argv[2] ?? '{}');
  const { url, strategy, timeout, outFile } = params;

  let payload;
  try {
    const run = await runLighthouse(url, { strategy, timeout });
    payload = run.ok
      ? { ok: true, data: readLighthouse(run.lhr, { strategy }) }
      : { ok: false, error: run.error };
  } catch (error) {
    payload = { ok: false, error: error?.message || String(error) };
  }

  await writeFile(outFile, JSON.stringify(payload), 'utf8');
}

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exit(1);
  }
);
