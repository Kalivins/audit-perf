/**
 * Lancement isole d'une mesure Lighthouse.
 *
 * Chaque mesure tourne dans son propre processus Node. Trois raisons, et la
 * premiere a ete decouverte en production sur un lot de seize sites :
 *
 * 1. Lighthouse n'est pas parallelisable dans un meme processus. Ses marques
 *    de performance sont globales et nommees ; deux mesures simultanees se
 *    disputent les memes noms et tuent le processus sur une exception levee
 *    hors de portee de tout try/catch. Le lot entier etait perdu.
 * 2. Un plantage de Lighthouse reste confine au fils. Le lot continue.
 * 3. La memoire et l'etat global sont rendus au systeme apres chaque mesure,
 *    ce qui compte sur un lot de plusieurs centaines de sites.
 *
 * Le cout est d'environ une a deux secondes de demarrage par mesure, face a
 * des mesures qui durent vingt a trente secondes.
 */

import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const WORKER = fileURLToPath(new URL('./lh-worker.js', import.meta.url));

/** Marge laissee au fils pour s'arreter proprement avant qu'on le tue. */
const MARGE_ARRET_MS = 15000;

/**
 * @param {string} url
 * @param {{strategy: string, timeout?: number, debug?: boolean}} options
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export function runLighthouseIsolated(url, options = {}) {
  const { strategy = 'mobile', timeout = 120000, debug = false } = options;
  const outFile = path.join(os.tmpdir(), `audit-perf-${randomUUID()}.json`);

  const params = JSON.stringify({ url, strategy, timeout, outFile });

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, params], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: timeout + MARGE_ARRET_MS,
      killSignal: 'SIGKILL',
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      // Borne la capture : un Lighthouse bavard ne doit pas remplir la memoire.
      if (stderr.length < 8000) stderr += chunk.toString();
    });

    const finir = async (echec) => {
      let payload = null;
      try {
        payload = JSON.parse(await readFile(outFile, 'utf8'));
      } catch {
        payload = null;
      }
      await rm(outFile, { force: true }).catch(() => {});

      if (payload) {
        resolve(payload);
        return;
      }
      resolve({
        ok: false,
        error: echec || 'le processus de mesure n\'a produit aucun resultat',
        ...(debug && stderr ? { stderr: stderr.slice(0, 2000) } : {}),
      });
    };

    child.on('error', (error) => {
      finir(`processus de mesure inutilisable : ${error?.message ?? error}`);
    });

    child.on('close', (code, signal) => {
      if (signal) {
        finir(`mesure interrompue apres ${Math.round(timeout / 1000)} s`);
        return;
      }
      finir(code === 0 ? null : `processus de mesure termine avec le code ${code}`);
    });
  });
}
