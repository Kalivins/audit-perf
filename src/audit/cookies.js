/**
 * Cookies reellement deposes avant tout consentement.
 *
 * L'analyse du HTML ne donne qu'un indice : des traceurs sont charges, aucun
 * bandeau n'est visible. Ici on constate. Un navigateur neuf ouvre la page,
 * ne clique sur rien, et on releve ce qui s'est ecrit dans son pot a cookies.
 * Le constat passe d'un soupcon a une preuve nommant les cookies.
 *
 * Le profil est temporaire et jetable : le navigateur se presente donc comme
 * un visiteur qui n'est jamais venu, ce qui est exactement la situation que la
 * loi encadre.
 *
 * Pilotage direct du protocole DevTools, avec le WebSocket natif de Node et
 * chrome-launcher deja present. Aucune dependance supplementaire.
 */

import * as ChromeLauncher from 'chrome-launcher';

const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--mute-audio',
  // Voir la note dans lighthouse.js : sous conteneur, le bac a sable de Chrome
  // reclame des droits que Docker refuse par defaut. Ce module lance son propre
  // Chrome, donc il lui faut la meme soupape. Sans elle, la campagne mesurerait
  // la performance et ne releverait jamais un seul cookie, en silence.
  ...(process.env.CHROME_FLAGS_SUP ?? '').split(/\s+/).filter(Boolean),
];

/**
 * Cookies deposes par des services de mesure ou de publicite. La liste sert a
 * qualifier, jamais a decider seule : un cookie inconnu est signale comme
 * inconnu, pas comme un traceur.
 */
const TRACEURS_CONNUS = [
  { motif: /^_ga($|_)/, service: 'Google Analytics' },
  { motif: /^_gid$|^_gat/, service: 'Google Analytics' },
  { motif: /^__utm/, service: 'Google Analytics (ancien)' },
  { motif: /^_gcl_/, service: 'Google Ads' },
  { motif: /^(IDE|test_cookie|DSID)$/, service: 'DoubleClick' },
  { motif: /^_fb[pc]$/, service: 'Pixel Meta' },
  { motif: /^_hj/, service: 'Hotjar' },
  { motif: /^_cl(ck|sk)$/, service: 'Microsoft Clarity' },
  { motif: /^_uet(sid|vid)/, service: 'Bing Ads' },
  { motif: /^_tt_/, service: 'TikTok' },
  { motif: /^li_|^bcookie$|^lidc$/, service: 'LinkedIn' },
  { motif: /^(VISITOR_INFO1_LIVE|YSC)$/, service: 'YouTube' },
  { motif: /^NID$|^1P_JAR$/, service: 'Google' },
  // Matomo peut etre configure de facon exemptee de consentement, si les
  // criteres de la CNIL sont respectes. Le dire au client plutot que lui
  // annoncer un manquement qu'il n'a peut-etre pas.
  { motif: /^_pk_/, service: 'Matomo', exemptable: true },
  { motif: /^tk_(ai|r3d|lr)/, service: 'WooCommerce Analytics' },
];

function qualifier(cookie) {
  const trouve = TRACEURS_CONNUS.find((t) => t.motif.test(cookie.name));
  if (!trouve) return null;
  return { ...cookie, service: trouve.service, exemptable: Boolean(trouve.exemptable) };
}

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Client minimal du protocole DevTools : un appel, une reponse. */
function connecter(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let compteur = 0;
    const enAttente = new Map();

    ws.addEventListener('message', (evenement) => {
      let message;
      try {
        message = JSON.parse(evenement.data);
      } catch {
        return;
      }
      const resolveur = enAttente.get(message.id);
      if (!resolveur) return;
      enAttente.delete(message.id);
      resolveur(message.result ?? {});
    });

    ws.addEventListener('error', () => reject(new Error('connexion DevTools impossible')));
    ws.addEventListener('open', () =>
      resolve({
        envoyer(methode, params = {}) {
          const id = ++compteur;
          return new Promise((res) => {
            enAttente.set(id, res);
            ws.send(JSON.stringify({ id, method: methode, params }));
          });
        },
        fermer() {
          try {
            ws.close();
          } catch {
            // Deja ferme : sans consequence.
          }
        },
      })
    );
  });
}

async function cibleDeLaPage(port, delai) {
  const limite = Date.now() + delai;
  while (Date.now() < limite) {
    try {
      const reponse = await fetch(`http://127.0.0.1:${port}/json/list`);
      const cibles = await reponse.json();
      const page = cibles.find((c) => c.type === 'page' && c.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Le navigateur n'ecoute pas encore.
    }
    await attendre(200);
  }
  return null;
}

/**
 * @param {string} url
 * @param {{timeout?: number}} options
 * @returns {Promise<{disponible: boolean, raison?: string, cookies?: array, traceurs?: array}>}
 */
export async function releverCookies(url, { timeout = 30000 } = {}) {
  let chrome = null;
  let session = null;

  try {
    chrome = await ChromeLauncher.launch({
      chromeFlags: CHROME_FLAGS,
      startingUrl: url,
    });

    const cible = await cibleDeLaPage(chrome.port, 10000);
    if (!cible) return { disponible: false, raison: 'page introuvable dans le navigateur' };

    session = await connecter(cible.webSocketDebuggerUrl);

    // On attend la fin du chargement, puis un delai supplementaire : beaucoup
    // de traceurs sont poses par des scripts differes, apres l'evenement load.
    const limite = Date.now() + Math.min(timeout, 25000);
    while (Date.now() < limite) {
      const { result } = await session.envoyer('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (result?.value === 'complete') break;
      await attendre(300);
    }
    await attendre(3000);

    const { cookies = [] } = await session.envoyer('Network.getAllCookies');

    const traceurs = cookies.map(qualifier).filter(Boolean);

    return {
      disponible: true,
      total: cookies.length,
      cookies: cookies.map((c) => ({
        nom: c.name,
        domaine: c.domain,
        tiers: !String(c.domain ?? '').includes(new URL(url).hostname.replace(/^www\./, '')),
      })),
      traceurs: traceurs.map((c) => ({
        nom: c.name,
        service: c.service,
        domaine: c.domain,
        exemptable: c.exemptable,
      })),
    };
  } catch (error) {
    return { disponible: false, raison: error?.message ?? String(error) };
  } finally {
    session?.fermer();
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // Deja mort.
      }
    }
  }
}

/**
 * Constat tire du releve. Ne dit que ce qui a ete observe.
 *
 * Deux constats distincts, et la nuance n'est pas cosmetique. Un cookie de
 * Google Analytics ou du pixel Meta appelle un consentement sans discussion.
 * Un cookie Matomo peut etre exempte si l'outil est configure selon les
 * criteres de la CNIL, ce que le releve seul ne permet pas de trancher.
 * Annoncer un manquement a un client qui a fait les choses correctement
 * couterait plus cher que de poser la question.
 */
export function checkCookies(releve) {
  if (!releve?.disponible || !releve.traceurs?.length) return [];

  const fermes = releve.traceurs.filter((t) => !t.exemptable);
  const retenus = fermes.length ? fermes : releve.traceurs;
  const services = [...new Set(retenus.map((t) => t.service))];

  return [
    {
      id: fermes.length
        ? 'cookies-traceurs-avant-consentement'
        : 'cookies-mesure-audience-a-verifier',
      source: 'navigateur',
      evidence: {
        nombre: retenus.length,
        services: services.join(', '),
        exemples: retenus.slice(0, 5).map((t) => t.nom).join(', '),
      },
    },
  ];
}
