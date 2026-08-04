/**
 * Comparaison entre entreprises d'un meme metier, a l'interieur du lot.
 *
 * L'argument le plus efficace d'un audit n'est pas un score sur cent, c'est un
 * rang. « Sur les quatre boulangeries de Besancon que j'ai mesurees, votre
 * page est la plus lente » se comprend sans explication.
 *
 * Precaution indispensable : cette comparaison ne porte que sur les sites du
 * lot, pas sur le secteur entier. Le rapport doit le dire, sinon le chiffre
 * devient un mensonge par omission.
 */

import { canoniser, libelleSecteur } from './secteurs.js';

/** En dessous, un rang ne veut rien dire et pourrait induire en erreur. */
export const MIN_POUR_COMPARER = 3;

function mediane(valeurs) {
  if (!valeurs.length) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 ? tri[milieu] : (tri[milieu - 1] + tri[milieu]) / 2;
}

/**
 * @param {array} records enregistrements deja rafraichis
 * @returns {Map<string, object>} identifiant de cible -> position dans son metier
 */
export function classerParSecteur(records) {
  const groupes = new Map();

  for (const record of records) {
    const lcp = record.lighthouse?.[record.profilRetenu]?.metrics?.lcp;
    if (!Number.isFinite(lcp)) continue;

    const secteur = canoniser(record.target.sector, record.target.name);
    if (!groupes.has(secteur)) groupes.set(secteur, []);
    groupes.get(secteur).push({ id: record.target.id, lcp });
  }

  const classement = new Map();

  for (const [secteur, membres] of groupes) {
    if (membres.length < MIN_POUR_COMPARER) continue;

    membres.sort((a, b) => a.lcp - b.lcp);
    const medianeSecteur = mediane(membres.map((m) => m.lcp));

    membres.forEach((membre, index) => {
      classement.set(membre.id, {
        secteur,
        libelle: libelleSecteur(secteur),
        rang: index + 1,
        total: membres.length,
        lcp: membre.lcp,
        mediane: medianeSecteur,
        meilleur: membres[0].lcp,
      });
    });
  }

  return classement;
}
