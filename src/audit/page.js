/**
 * Audit d'une page secondaire, et regroupement des constats multi-pages.
 *
 * Seules les verifications qui varient reellement d'une page a l'autre sont
 * rejouees : titre, description, titraille, images. Les fontes, les en-tetes
 * ou la pile technique sont des proprietes du site, les repeter page par page
 * gonflerait le rapport sans rien apprendre.
 *
 * Lighthouse ne tourne pas sur ces pages. Une mesure de performance coute une
 * trentaine de secondes ; la multiplier par cinq pour chaque site rendrait un
 * lot de prospection impraticable, alors que les defauts de contenu, eux,
 * s'obtiennent avec une seule requete.
 */

import { parse as parseHtml } from 'node-html-parser';
import { fetchHomepage } from '../net/http.js';
import { hostOf } from '../net/politeness.js';
import { checkMeta } from './checks/meta.js';
import { checkViewport } from './checks/viewport.js';
import { checkImages } from './checks/images.js';

/** En dessous, la page ne contient rien d'analysable. */
const MIN_UTILE = 500;

export async function chargerPage(url, { scheduler, httpOptions }) {
  const reponse = await scheduler.run(hostOf(url), () =>
    fetchHomepage(url, httpOptions)
  );

  if (reponse.error || !reponse.ok) {
    return { ok: false, url, statut: reponse.status, erreur: reponse.error };
  }

  const html = reponse.body;
  const utile =
    html.trim().length >= MIN_UTILE || /<body[\s>]/i.test(html);
  if (!utile) {
    return { ok: false, url, statut: reponse.status, erreur: 'contenu_vide' };
  }

  return {
    ok: true,
    url: reponse.url,
    statut: reponse.status,
    html,
    dom: parseHtml(html, {
      lowerCaseTagName: false,
      comment: false,
      blockTextElements: { script: true, style: true, noscript: true },
    }),
  };
}

/** Constats propres a une page, chacun marque de la page ou il a ete releve. */
export function auditerPage({ dom, page }) {
  const findings = [
    ...checkMeta({ dom }),
    ...checkViewport({ dom }),
    ...checkImages({ dom }).findings,
  ];

  return findings.map((finding) => ({
    ...finding,
    page: { url: page.url, role: page.role, libelle: page.libelle },
  }));
}

/**
 * Regroupe les constats identiques releves sur plusieurs pages.
 *
 * Un titre absent sur trois pages est un seul probleme, avec trois exemples.
 * En faire trois lignes noierait le rapport et donnerait l'impression d'un
 * site trois fois plus abime qu'il ne l'est.
 */
export function regrouperParPage(findingsAccueil, findingsSecondaires) {
  const parId = new Map();

  for (const finding of findingsAccueil) {
    parId.set(finding.id, { ...finding, pages: [] });
  }

  for (const finding of findingsSecondaires) {
    const existant = parId.get(finding.id);
    const libelle = finding.page?.libelle ?? finding.page?.url ?? null;

    if (!existant) {
      // Constat absent de l'accueil : il vient d'une page secondaire, et le
      // dire change la priorite que le client lui donnera.
      parId.set(finding.id, {
        ...finding,
        pages: libelle ? [libelle] : [],
      });
      continue;
    }

    if (libelle && !existant.pages.includes(libelle)) existant.pages.push(libelle);
  }

  return [...parId.values()].map(({ page, pages, ...reste }) => ({
    ...reste,
    evidence: {
      ...reste.evidence,
      ...(pages.length ? { pages_concernees: pages.join(', ') } : {}),
    },
  }));
}
