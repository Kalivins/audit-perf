/**
 * Liens internes casses.
 *
 * Verification volontairement bornee. Chaque lien coute une requete et le
 * delai de politesse qui va avec : verifier deux cents liens sur trois cents
 * sites reviendrait a marteler des serveurs mutualises pendant des heures pour
 * un gain marginal. On sonde un echantillon des liens les plus exposes, ceux
 * du menu et du pied de page, et le rapport dit combien ont ete verifies.
 *
 * Desactive en mode rapide : un balayage de prospection n'a pas besoin de ce
 * niveau de detail, un audit facture si.
 */

import { probe } from '../../net/http.js';
import { hostOf } from '../../net/politeness.js';

const EXTENSIONS_IGNOREES = /\.(jpe?g|png|gif|webp|avif|svg|css|js|ico|woff2?)(\?|#|$)/i;

/** Codes qui signalent une page reellement absente, pas une simple protection. */
const CODES_MORTS = new Set([404, 410]);

function candidats(dom, baseUrl, deja) {
  const origine = new URL(baseUrl);
  const vus = new Map();

  for (const ancre of dom.querySelectorAll('a[href]')) {
    const href = ancre.getAttribute('href') ?? '';
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;

    let url;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }

    url.hash = '';
    if (url.host !== origine.host) continue;
    if (EXTENSIONS_IGNOREES.test(url.pathname)) continue;

    const cle = url.toString();
    if (vus.has(cle) || deja.has(cle)) continue;

    vus.set(cle, {
      url: cle,
      intitule: (ancre.text || '').replace(/\s+/g, ' ').trim().slice(0, 50),
    });
  }

  return [...vus.values()];
}

/**
 * @param {object} params
 * @param {number} params.max nombre de liens sondes, 0 pour ne rien verifier
 * @param {Set<string>} params.deja adresses deja sollicitees, a ne pas refaire
 */
export async function checkLiens({ dom, baseUrl, max = 10, deja = new Set(), scheduler, httpOptions }) {
  if (!max) return { findings: [], summary: { verifies: 0, morts: [] } };

  const aVerifier = candidats(dom, baseUrl, deja).slice(0, max);
  const morts = [];

  for (const lien of aVerifier) {
    const reponse = await scheduler.run(hostOf(lien.url), () => probe(lien.url, httpOptions));
    // Une erreur reseau ne prouve rien : le lien peut etre bon et le serveur
    // occupe. Seul un code d'absence explicite est retenu.
    if (reponse.error) continue;
    if (CODES_MORTS.has(reponse.status)) {
      morts.push({
        url: new URL(lien.url).pathname,
        intitule: lien.intitule || '(sans intitulé)',
        statut: reponse.status,
      });
    }
  }

  const findings = morts.length
    ? [
        {
          id: 'liens-morts',
          source: 'html',
          evidence: {
            nombre: morts.length,
            verifies: aVerifier.length,
            exemples: morts
              .slice(0, 4)
              .map((m) => `« ${m.intitule} » vers ${m.url}`)
              .join(', '),
          },
        },
      ]
    : [];

  return { findings, summary: { verifies: aVerifier.length, morts } };
}
