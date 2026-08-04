/**
 * Presence et taille du sitemap.
 *
 * Deux apports : un constat quand il manque, et surtout une mesure de la
 * taille reelle du site. Savoir qu'un site compte huit pages ou deux cents
 * change la conversation, le devis, et le temps annonce au client.
 *
 * Deux adresses sont tentees au maximum. Un sitemap declare dans le robots.txt
 * est prioritaire puisque c'est celui que le site revendique.
 */

import { probe, request } from '../../net/http.js';
import { hostOf } from '../../net/politeness.js';

const CHEMINS_USUELS = ['/sitemap.xml', '/sitemap_index.xml'];

/** Nombre d'adresses conservees pour alimenter le choix des pages a auditer. */
const ECHANTILLON_MAX = 60;

/** Comptage sans analyseur XML : on ne cherche que des balises connues. */
function analyser(xml) {
  const estIndex = /<sitemapindex[\s>]/i.test(xml);
  const adresses = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  return {
    estIndex,
    entrees: adresses.length,
    // Un index liste des sitemaps, pas des pages : ses adresses ne servent
    // pas a choisir quoi auditer.
    echantillon: estIndex ? [] : adresses.slice(0, ECHANTILLON_MAX),
  };
}

export async function checkSitemap({ baseUrl, declares = [], scheduler, httpOptions }) {
  const origine = new URL(baseUrl).origin;
  const candidats = [
    ...declares,
    ...CHEMINS_USUELS.map((chemin) => `${origine}${chemin}`),
  ];

  const vus = new Set();
  for (const url of candidats) {
    if (vus.has(url) || vus.size >= 2) continue;
    vus.add(url);

    const tete = await scheduler.run(hostOf(url), () => probe(url, httpOptions));
    if (!tete.ok) continue;

    // Certains serveurs repondent 200 a tout, y compris a une page d'erreur
    // habillee. On verifie que le contenu ressemble bien a un sitemap.
    const contenu = tete.body
      ? tete
      : await scheduler.run(hostOf(url), () => request(url, httpOptions));
    if (!/<(urlset|sitemapindex)[\s>]/i.test(contenu.body ?? '')) continue;

    const { estIndex, entrees, echantillon } = analyser(contenu.body);
    return {
      findings: [],
      adresses: echantillon,
      summary: {
        present: true,
        url,
        index: estIndex,
        // Sur un index, les entrees sont des sitemaps, pas des pages : on ne
        // fait pas passer les uns pour les autres.
        pages: estIndex ? null : entrees,
        sitemaps: estIndex ? entrees : null,
      },
    };
  }

  return {
    findings: [{ id: 'sitemap-absent', source: 'html', evidence: {} }],
    adresses: [],
    summary: { present: false, url: null, pages: null },
  };
}
