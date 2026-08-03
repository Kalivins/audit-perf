/**
 * Catalogue des constats : gravite, poids, effort de correction.
 *
 * Le classement ne se fait pas aux millisecondes. Une page depourvue de
 * mentions legales ne fait economiser aucune milliseconde et expose a une
 * amende ; un site qui interdit son indexation est parfait techniquement et
 * invisible sur Google. Trier au temps gagne ferait passer ces constats
 * derriere une image mal compressee.
 *
 * D'ou trois paliers. Le tri au temps gagne ne joue qu'a l'interieur d'un
 * palier, jamais entre deux.
 */

export const TIERS = {
  /** Juridique, securite, ou site inutilisable. Binaire, prioritaire. */
  BLOQUANT: 'bloquant',
  /** Perte de visiteurs mesurable, chiffrable en temps ou en poids. */
  COUTEUX: 'couteux',
  /** Contenu, referencement, accessibilite. Reel mais non urgent. */
  CORRIGER: 'corriger',
};

export const TIER_LABELS = {
  [TIERS.BLOQUANT]: 'Bloquant',
  [TIERS.COUTEUX]: 'Couteux',
  [TIERS.CORRIGER]: 'A corriger',
};

/** Ordre d'affichage des paliers. */
export const TIER_ORDER = [TIERS.BLOQUANT, TIERS.COUTEUX, TIERS.CORRIGER];

export const EFFORTS = {
  FAIBLE: 'faible',
  MOYEN: 'moyen',
  ELEVE: 'eleve',
};

const B = TIERS.BLOQUANT;
const C = TIERS.COUTEUX;
const A = TIERS.CORRIGER;
const { FAIBLE, MOYEN, ELEVE } = EFFORTS;

/**
 * poids : rang a l'interieur du palier, de 0 a 100.
 * theme : fichier de textes qui porte l'explication client.
 */
export const RULES = {
  // ---------------------------------------------------------------- bloquant
  'indexation-bloquee': { tier: B, poids: 100, effort: FAIBLE, theme: 'contenu' },
  'https-absent': { tier: B, poids: 98, effort: FAIBLE, theme: 'conformite' },
  'mentions-legales-absentes': { tier: B, poids: 95, effort: FAIBLE, theme: 'conformite' },
  'page-sans-contenu-html': { tier: B, poids: 94, effort: ELEVE, theme: 'contenu' },
  'confidentialite-absente': { tier: B, poids: 90, effort: FAIBLE, theme: 'conformite' },
  'traceurs-sans-consentement': { tier: B, poids: 88, effort: MOYEN, theme: 'conformite' },
  'viewport-absent': { tier: B, poids: 86, effort: FAIBLE, theme: 'conformite' },
  'php-obsolete': { tier: B, poids: 84, effort: MOYEN, theme: 'conformite' },
  'code-http-anormal': { tier: B, poids: 82, effort: MOYEN, theme: 'contenu' },
  'mentions-legales-cassees': { tier: B, poids: 80, effort: FAIBLE, theme: 'conformite' },
  'confidentialite-cassee': { tier: B, poids: 78, effort: FAIBLE, theme: 'conformite' },
  'ressources-non-securisees': { tier: B, poids: 76, effort: MOYEN, theme: 'conformite' },
  'https-non-force': { tier: B, poids: 74, effort: FAIBLE, theme: 'conformite' },
  'viewport-mal-configure': { tier: B, poids: 72, effort: FAIBLE, theme: 'conformite' },
  'zoom-bloque': { tier: B, poids: 70, effort: FAIBLE, theme: 'conformite' },

  // ---------------------------------------------------------------- couteux
  'lcp-trop-lent': { tier: C, poids: 100, effort: MOYEN, theme: 'performance' },
  'page-trop-lourde': { tier: C, poids: 90, effort: MOYEN, theme: 'performance' },
  'images-surdimensionnees': { tier: C, poids: 88, effort: FAIBLE, theme: 'performance' },
  'images-format-ancien': { tier: C, poids: 86, effort: FAIBLE, theme: 'performance' },
  'ressources-bloquantes': { tier: C, poids: 84, effort: MOYEN, theme: 'performance' },
  'serveur-lent': { tier: C, poids: 82, effort: ELEVE, theme: 'performance' },
  'javascript-inutilise': { tier: C, poids: 78, effort: MOYEN, theme: 'performance' },
  'reactivite-faible': { tier: C, poids: 76, effort: ELEVE, theme: 'performance' },
  'cls-eleve': { tier: C, poids: 74, effort: MOYEN, theme: 'performance' },
  'images-non-compressees': { tier: C, poids: 72, effort: FAIBLE, theme: 'performance' },
  'compression-absente': { tier: C, poids: 70, effort: FAIBLE, theme: 'performance' },
  'services-tiers-lourds': { tier: C, poids: 68, effort: MOYEN, theme: 'performance' },
  'css-inutilise': { tier: C, poids: 60, effort: MOYEN, theme: 'performance' },
  'fontes-bloquantes': { tier: C, poids: 58, effort: FAIBLE, theme: 'performance' },
  'images-sans-chargement-differe': { tier: C, poids: 56, effort: FAIBLE, theme: 'performance' },
  'cache-mal-configure': { tier: C, poids: 54, effort: FAIBLE, theme: 'performance' },
  'redirections-en-chaine': { tier: C, poids: 52, effort: FAIBLE, theme: 'performance' },
  'javascript-obsolete': { tier: C, poids: 48, effort: MOYEN, theme: 'performance' },
  'javascript-duplique': { tier: C, poids: 46, effort: MOYEN, theme: 'performance' },
  'animations-lourdes': { tier: C, poids: 44, effort: MOYEN, theme: 'performance' },
  'javascript-non-minifie': { tier: C, poids: 40, effort: FAIBLE, theme: 'performance' },
  'css-non-minifie': { tier: C, poids: 38, effort: FAIBLE, theme: 'performance' },
  'fontes-locales-sans-affichage': { tier: C, poids: 36, effort: FAIBLE, theme: 'performance' },

  // -------------------------------------------------------------- a corriger
  'titre-absent': { tier: A, poids: 90, effort: FAIBLE, theme: 'contenu' },
  'description-absente': { tier: A, poids: 80, effort: FAIBLE, theme: 'contenu' },
  'images-sans-description': { tier: A, poids: 76, effort: MOYEN, theme: 'contenu' },
  'contraste-insuffisant': { tier: A, poids: 74, effort: MOYEN, theme: 'contenu' },
  'titre-h1-absent': { tier: A, poids: 70, effort: FAIBLE, theme: 'contenu' },
  'champs-sans-etiquette': { tier: A, poids: 68, effort: MOYEN, theme: 'contenu' },
  'liens-sans-intitule': { tier: A, poids: 64, effort: FAIBLE, theme: 'contenu' },
  'boutons-sans-intitule': { tier: A, poids: 62, effort: FAIBLE, theme: 'contenu' },
  'images-sans-dimensions': { tier: A, poids: 60, effort: FAIBLE, theme: 'performance' },
  'erreurs-javascript': { tier: A, poids: 56, effort: MOYEN, theme: 'contenu' },
  'titre-trop-long': { tier: A, poids: 50, effort: FAIBLE, theme: 'contenu' },
  'description-trop-longue': { tier: A, poids: 48, effort: FAIBLE, theme: 'contenu' },
  'langue-non-declaree': { tier: A, poids: 46, effort: FAIBLE, theme: 'contenu' },
  'titre-trop-court': { tier: A, poids: 44, effort: FAIBLE, theme: 'contenu' },
  'description-trop-courte': { tier: A, poids: 42, effort: FAIBLE, theme: 'contenu' },
  'titres-h1-multiples': { tier: A, poids: 40, effort: FAIBLE, theme: 'contenu' },
  'liens-non-suivables': { tier: A, poids: 38, effort: MOYEN, theme: 'contenu' },
  'partage-social-non-configure': { tier: A, poids: 30, effort: FAIBLE, theme: 'contenu' },
  'technologies-depreciees': { tier: A, poids: 28, effort: MOYEN, theme: 'contenu' },
};

export const EFFORT_LABELS = {
  [EFFORTS.FAIBLE]: 'rapide',
  [EFFORTS.MOYEN]: 'quelques heures',
  [EFFORTS.ELEVE]: 'chantier',
};

export function ruleFor(id) {
  return RULES[id] ?? null;
}

/** Identifiants presents dans le catalogue mais depourvus de texte client. */
export function missingCopy(copy) {
  return Object.keys(RULES).filter((id) => !copy[id]);
}
