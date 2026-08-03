/**
 * Estimation chiffree du gain potentiel.
 *
 * Regle de la maison : tout nombre presente au client porte sa source, et
 * aucun nombre n'est invente. Un audit facture 490 euros ne survit pas a un
 * chiffre que le client fait verifier par son neveu informaticien.
 *
 * Ce qui est calcule ici :
 *   - le temps d'affichage mesure, compare au seuil publie par Google
 *   - le poids evitable, somme des economies que Lighthouse chiffre lui-meme
 *   - la traduction de ce poids en secondes d'attente, au debit exact que
 *     Lighthouse utilise pour simuler une 4G
 *
 * Ce qui n'est calcule qu'a la demande :
 *   - la perte de visiteurs, uniquement si un trafic mensuel a ete renseigne,
 *     et toujours accompagnee de sa source et de sa reserve
 *
 * Ce qui n'est jamais produit :
 *   - un montant en euros. Sans le panier moyen et le taux de transformation
 *     reels de l'entreprise, ce serait de l'invention pure.
 */

import { CWV_THRESHOLDS } from '../config.js';

/** Ces libelles figurent tels quels dans le rapport client, d'ou les accents. */
export const SOURCES = {
  cwv: 'Seuils Core Web Vitals publiés par Google',
  debit: 'Débit de la 4G simulée par Lighthouse, 1 638 kbit/s',
  rebond: 'Google et SOASTA, The State of Online Retail Performance, 2017',
  lighthouse: 'Économies estimées par Lighthouse',
};

/** Debit exact de la 4G simulee par Lighthouse en profil mobile, en kbit/s. */
const MOBILE_THROUGHPUT_KBPS = 1638.4;

/**
 * Familles d'economies qui portent sur les memes fichiers.
 *
 * Convertir une image en WebP, la redimensionner et la recompresser visent les
 * memes octets : additionner les trois economies annoncees par Lighthouse
 * donnerait un total largement superieur a ce qu'on peut reellement gagner.
 * On retient donc la plus grande economie de chaque famille, puis on additionne
 * les familles entre elles. Sous-estimer est sans danger, surestimer coute le
 * client des qu'il fait verifier le chiffre.
 */
const FAMILLES = {
  images: [
    'images-format-ancien',
    'images-surdimensionnees',
    'images-non-compressees',
    'animations-lourdes',
  ],
  javascript: [
    'javascript-inutilise',
    'javascript-obsolete',
    'javascript-duplique',
    'javascript-non-minifie',
  ],
  styles: ['css-inutilise', 'css-non-minifie'],
  transfert: ['compression-absente'],
};

const FAMILLE_DE = new Map(
  Object.entries(FAMILLES).flatMap(([famille, ids]) => ids.map((id) => [id, famille]))
);

/**
 * Economie d'octets par famille, en ne gardant que la plus grosse de chaque.
 * Seules les economies chiffrees par Lighthouse comptent : un constat deduit
 * d'une metrique n'est pas une opportunite de reduction de poids.
 */
function economieParFamille(findings) {
  const parFamille = new Map();

  for (const finding of findings) {
    if (finding.source !== 'lighthouse') continue;
    if (!Number.isFinite(finding.savingsBytes) || finding.savingsBytes <= 0) continue;

    const famille = FAMILLE_DE.get(finding.id) ?? finding.id;
    const courant = parFamille.get(famille) ?? { octets: 0, retenu: null };
    if (finding.savingsBytes > courant.octets) {
      parFamille.set(famille, { octets: finding.savingsBytes, retenu: finding.id });
    }
  }

  return parFamille;
}

/**
 * Augmentation de la probabilite de rebond selon le temps de chargement,
 * par rapport a une reference d'une seconde. Valeurs publiees par Google et
 * SOASTA en 2017 ; les points intermediaires sont interpoles lineairement.
 */
const BOUNCE_CURVE = [
  { secondes: 1, hausse: 0 },
  { secondes: 3, hausse: 32 },
  { secondes: 5, hausse: 90 },
  { secondes: 6, hausse: 106 },
  { secondes: 10, hausse: 123 },
];

function bounceIncrease(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 1) return 0;
  if (seconds >= 10) return BOUNCE_CURVE.at(-1).hausse;

  for (let i = 1; i < BOUNCE_CURVE.length; i += 1) {
    const prev = BOUNCE_CURVE[i - 1];
    const next = BOUNCE_CURVE[i];
    if (seconds <= next.secondes) {
      const ratio = (seconds - prev.secondes) / (next.secondes - prev.secondes);
      return prev.hausse + ratio * (next.hausse - prev.hausse);
    }
  }
  return 0;
}

/** Octets convertis en secondes de telechargement sur la 4G simulee. */
export function bytesToMobileSeconds(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return (bytes * 8) / (MOBILE_THROUGHPUT_KBPS * 1000);
}

/**
 * @param {object} params
 * @param {object|null} params.lh lecture Lighthouse en profil mobile
 * @param {array} params.findings constats consolides
 * @param {object} params.target cible, pour le trafic mensuel eventuel
 */
export function estimateGains({ lh, findings = [], target = {} }) {
  const metrics = lh?.metrics ?? null;
  const resources = lh?.resources ?? null;

  const gains = {
    mesurable: Boolean(metrics),
    sources: [],
    temps: null,
    poids: null,
    audience: null,
  };

  if (!metrics) return gains;

  // ------------------------------------------------------------------ temps
  const lcp = metrics.lcp;
  if (Number.isFinite(lcp)) {
    const cible = CWV_THRESHOLDS.lcp.good;
    gains.temps = {
      actuel_ms: Math.round(lcp),
      cible_ms: cible,
      ecart_ms: Math.max(0, Math.round(lcp - cible)),
      conforme: lcp <= cible,
      source: SOURCES.cwv,
    };
    gains.sources.push(SOURCES.cwv);
  }

  // ------------------------------------------------------------------ poids
  const parFamille = economieParFamille(findings);
  const economieOctets = [...parFamille.values()].reduce((t, f) => t + f.octets, 0);

  // Les millisecondes se recouvrent d'une opportunite a l'autre, Lighthouse le
  // dit lui-meme. On ne les additionne jamais : on retient la plus grosse
  // economie unitaire, qui est un plancher defendable.
  const plusGrosGainMs = findings.reduce(
    (max, f) =>
      f.source === 'lighthouse' && Number.isFinite(f.savingsMs)
        ? Math.max(max, f.savingsMs)
        : max,
    0
  );

  if (Number.isFinite(resources?.poids_total) && resources.poids_total > 0) {
    const evitable = Math.min(economieOctets, resources.poids_total);
    gains.poids = {
      actuel_octets: Math.round(resources.poids_total),
      evitable_octets: Math.round(evitable),
      part_evitable: evitable / resources.poids_total,
      requetes: resources.requetes ?? null,
      secondes_4g_actuel: bytesToMobileSeconds(resources.poids_total),
      secondes_4g_economisees: bytesToMobileSeconds(evitable),
      plus_gros_gain_unitaire_ms: plusGrosGainMs || null,
      detail_familles: Object.fromEntries(
        [...parFamille.entries()].map(([famille, f]) => [famille, f.octets])
      ),
      methode:
        'Plus grosse économie retenue par famille de fichiers, puis addition des ' +
        'familles. Les économies portant sur les mêmes fichiers ne sont pas cumulées.',
      source: `${SOURCES.lighthouse}. ${SOURCES.debit}`,
    };
    gains.sources.push(SOURCES.lighthouse, SOURCES.debit);
  }

  // --------------------------------------------------------------- audience
  //
  // Uniquement si un trafic mensuel a ete renseigne dans le fichier de
  // cibles. Sans volume connu, tout chiffre de perte serait fabrique, et la
  // question se pose bien mieux de vive voix au rendez-vous.
  const trafic = target?.monthlyTraffic;
  if (Number.isFinite(trafic) && trafic > 0 && Number.isFinite(lcp)) {
    const secondes = lcp / 1000;
    const hausse = bounceIncrease(secondes);
    if (hausse > 0) {
      gains.audience = {
        trafic_mensuel: trafic,
        hausse_rebond_pct: Math.round(hausse),
        reference: 'un chargement en 1 seconde',
        source: SOURCES.rebond,
        reserve:
          "Ordre de grandeur issu d'une étude sectorielle, appliqué à votre trafic " +
          'déclaré. Il indique une tendance et ne remplace pas la mesure de vos ' +
          'propres statistiques.',
      };
      gains.sources.push(SOURCES.rebond);
    }
  }

  gains.sources = [...new Set(gains.sources)];
  return gains;
}
