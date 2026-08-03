/**
 * Execution de Lighthouse.
 *
 * Un Chrome neuf est lance pour chaque mesure, puis tue. C'est un peu plus
 * lent, mais un navigateur reutilise garde le cache et les cookies du site
 * precedent, ce qui fausse silencieusement les temps mesures. Sur un outil
 * dont toute la valeur repose sur des chiffres opposables, l'isolement prime
 * sur la vitesse.
 */

import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as ChromeLauncher from 'chrome-launcher';

export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--mute-audio',
];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} : delai de ${ms} ms depasse`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {string} url
 * @param {{strategy: 'mobile'|'desktop', timeout?: number}} options
 * @returns {Promise<{ok: boolean, lhr?: object, error?: string}>}
 */
export async function runLighthouse(url, { strategy = 'mobile', timeout = 120000 } = {}) {
  let chrome = null;

  try {
    chrome = await ChromeLauncher.launch({ chromeFlags: CHROME_FLAGS });

    const flags = {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORIES,
    };

    const result = await withTimeout(
      lighthouse(url, flags, strategy === 'desktop' ? desktopConfig : undefined),
      timeout,
      `Lighthouse ${strategy}`
    );

    const lhr = result?.lhr;
    if (!lhr) {
      return { ok: false, error: 'Lighthouse n\'a produit aucun rapport' };
    }

    // Lighthouse rend un rapport meme quand la page n'a pas pu etre mesuree
    // (NO_FCP, page bloquee, redirection en boucle). Sans ce controle on
    // publierait des scores de zero parfaitement faux.
    if (lhr.runtimeError?.code && lhr.runtimeError.code !== 'NO_ERROR') {
      return {
        ok: false,
        error: `${lhr.runtimeError.code} : ${lhr.runtimeError.message ?? ''}`.trim(),
      };
    }

    return { ok: true, lhr };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // Chrome deja mort : sans importance, on ne doit pas masquer l'erreur
        // d'origine pour autant.
      }
    }
  }
}

/** Chrome est-il installe et lancable ? Verifie avant de demarrer un lot. */
export async function checkChromeAvailable() {
  try {
    const installations = ChromeLauncher.Launcher.getInstallations();
    return { ok: installations.length > 0, path: installations[0] ?? null };
  } catch (error) {
    return { ok: false, path: null, error: error?.message };
  }
}
