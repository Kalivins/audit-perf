/**
 * Execution de Lighthouse, dans le processus courant.
 *
 * IMPORTANT : ne jamais appeler cette fonction deux fois en parallele dans un
 * meme processus. Lighthouse mesure ses propres durees avec des marques de
 * performance globales nommees (via lighthouse-logger et marky). Deux
 * executions simultanees utilisent les memes noms, la seconde tente de fermer
 * une marque que la premiere a deja consommee, et le processus meurt sur une
 * DOMException levee dans un autre tick, hors de portee de tout try/catch.
 *
 * Le lot passe donc par lh-runner.js, qui isole chaque mesure dans son propre
 * processus. Cette fonction reste l'implementation appelee par ce processus
 * fils, et sert aussi aux essais unitaires en mesure unique.
 *
 * Un Chrome neuf est lance pour chaque mesure, puis tue : un navigateur
 * reutilise garde le cache et les cookies du site precedent, ce qui fausse
 * silencieusement les temps. Sur un outil dont la valeur repose sur des
 * chiffres opposables, l'isolement prime sur la vitesse.
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
  // Des drapeaux supplementaires, quand l'environnement l'exige.
  //
  // Dans un conteneur, le bac a sable de Chrome reclame des espaces de noms
  // utilisateur que le profil seccomp de Docker interdit par defaut. Chrome
  // refuse alors de demarrer, et le message ne dit pas pourquoi. La reponse
  // habituelle est --no-sandbox, acceptable ici parce que la mesure tourne sur
  // une machine dediee et ne visite que des sites publics.
  //
  // Passer par une variable evite de graver ce choix dans le code : le poste
  // de travail garde son bac a sable, le conteneur ajoute ce qu'il lui faut.
  ...(process.env.CHROME_FLAGS_SUP ?? '').split(/\s+/).filter(Boolean),
];

/**
 * Bruit emis par les entrailles de Lighthouse sur des sites reels. Ces
 * messages ne concernent pas le site audite et ne sont pas actionnables. Les
 * taire garde exploitable la sortie d'erreur du processus de mesure, qu'on
 * relit justement quand quelque chose ne va pas.
 */
const BRUIT_CONNU = [
  /Failed to parse source map/i,
  /mapping for last column out of bounds/i,
  /source ?map/i,
];

let silenceProfondeur = 0;
let consoleErreurOriginale = null;

function taireLeBruit() {
  if (silenceProfondeur++ > 0) return;
  consoleErreurOriginale = console.error;
  console.error = (...args) => {
    const texte = args.map((a) => String(a?.message ?? a)).join(' ');
    if (BRUIT_CONNU.some((motif) => motif.test(texte))) return;
    consoleErreurOriginale(...args);
  };
}

function retablirLaConsole() {
  if (--silenceProfondeur > 0) return;
  if (consoleErreurOriginale) console.error = consoleErreurOriginale;
  consoleErreurOriginale = null;
}

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
  taireLeBruit();

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
    retablirLaConsole();
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
