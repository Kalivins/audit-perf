/**
 * Score de prospection.
 *
 * A ne pas confondre avec un score Lighthouse, et le rapport client ne
 * l'affiche jamais. Il ne mesure pas la qualite d'un site, il mesure a quel
 * point cette entreprise a besoin qu'on l'appelle. Un score eleve veut dire
 * beaucoup a reparer, et donc une conversation facile a ouvrir avec des faits.
 */

import { TIERS } from './rules.js';

const POIDS = {
  performance: 40,
  bloquants: 25,
  legal: 15,
  seo: 10,
  accessibilite: 10,
};

/**
 * En mode rapide, les scores Lighthouse manquent et le bareme se reduit a deux
 * criteres, ce qui tasse les sites sur une poignee de valeurs identiques. Or
 * c'est justement le mode qui sert a trier. On ajoute donc le volume des
 * constats non bloquants, disponible sans navigateur, pour retrouver du relief.
 */
const POIDS_AUTRES_PARTIEL = 20;
const AUTRES_SATURATION = 10;

/** Au dela de ce nombre de constats bloquants, le maximum est atteint. */
const BLOQUANTS_SATURATION = 4;

const LEGAL_IDS = new Set([
  'mentions-legales-absentes',
  'mentions-legales-cassees',
  'confidentialite-absente',
  'confidentialite-cassee',
  'traceurs-sans-consentement',
]);

/**
 * @returns {{score: number, partiel: boolean, detail: object}}
 */
export function prospectScore({ lh = null, consolidated = null }) {
  const findings = consolidated?.findings ?? [];
  const scores = lh?.scores ?? null;

  const bloquants = findings.filter((f) => f.tier === TIERS.BLOQUANT).length;
  const legal = findings.some((f) => LEGAL_IDS.has(f.id));

  const detail = {
    bloquants: POIDS.bloquants * Math.min(1, bloquants / BLOQUANTS_SATURATION),
    legal: legal ? POIDS.legal : 0,
    performance: 0,
    seo: 0,
    accessibilite: 0,
  };

  // Sans Lighthouse (mode rapide), les trois quarts du bareme sont
  // indisponibles. Plutot que de noter sur 40 en laissant croire a un score
  // sur 100, on ramene le total a l'echelle des criteres reellement mesures
  // et on marque le resultat comme partiel.
  const partiel = !scores;

  if (scores) {
    if (Number.isFinite(scores.performance)) {
      detail.performance = POIDS.performance * (1 - scores.performance);
    }
    if (Number.isFinite(scores.seo)) {
      detail.seo = POIDS.seo * (1 - scores.seo);
    }
    if (Number.isFinite(scores.accessibilite)) {
      detail.accessibilite = POIDS.accessibilite * (1 - scores.accessibilite);
    }
  } else {
    const autres = findings.filter((f) => f.tier !== TIERS.BLOQUANT).length;
    detail.autres = POIDS_AUTRES_PARTIEL * Math.min(1, autres / AUTRES_SATURATION);
  }

  const brut = Object.values(detail).reduce((a, b) => a + b, 0);
  const echelle = partiel
    ? POIDS.bloquants + POIDS.legal + POIDS_AUTRES_PARTIEL
    : 100;
  const score = Math.round((brut / echelle) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    partiel,
    detail,
  };
}

/**
 * Motif d'accroche : le constat le plus parlant a mettre dans un premier
 * courrier. Le premier bloquant s'il y en a un, sinon le temps d'affichage.
 */
export function hook({ consolidated, lh }) {
  const premier = consolidated?.findings?.[0];
  if (premier?.tier === TIERS.BLOQUANT) return premier.texte.titre;
  if (Number.isFinite(lh?.metrics?.lcp) && lh.metrics.lcp > 2500) {
    return `Page affichée en ${(lh.metrics.lcp / 1000).toFixed(1).replace('.', ',')} s sur mobile`;
  }
  return premier?.texte?.titre ?? null;
}
