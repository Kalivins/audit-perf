/**
 * Lecture d'un rapport Lighthouse : metriques, poids, et constats chiffres.
 *
 * Les identifiants de constat sont volontairement les memes que ceux emis par
 * les controles HTML de la phase 1. Quand Lighthouse a tourne, sa version
 * l'emporte parce qu'elle porte une economie mesuree en millisecondes ou en
 * octets, ce que l'analyse du HTML seul ne peut pas fournir.
 */

/**
 * Correspondance audit Lighthouse -> identifiant de constat.
 * Un meme identifiant peut etre alimente par plusieurs audits, le plus
 * defavorable l'emporte a la consolidation.
 */
const AUDIT_MAP = {
  // Performance, avec economie chiffree par Lighthouse
  'modern-image-formats': 'images-format-ancien',
  'uses-optimized-images': 'images-non-compressees',
  'uses-responsive-images': 'images-surdimensionnees',
  'offscreen-images': 'images-sans-chargement-differe',
  'unused-javascript': 'javascript-inutilise',
  'unused-css-rules': 'css-inutilise',
  'unminified-javascript': 'javascript-non-minifie',
  'unminified-css': 'css-non-minifie',
  'render-blocking-resources': 'ressources-bloquantes',
  'uses-text-compression': 'compression-absente',
  'server-response-time': 'serveur-lent',
  redirects: 'redirections-en-chaine',
  'efficient-animated-content': 'animations-lourdes',
  'legacy-javascript': 'javascript-obsolete',
  'duplicated-javascript': 'javascript-duplique',
  'uses-long-cache-ttl': 'cache-mal-configure',
  'total-byte-weight': 'page-trop-lourde',
  'font-display': 'fontes-bloquantes',
  'unsized-images': 'images-sans-dimensions',
  'third-party-summary': 'services-tiers-lourds',

  // Accessibilite, restreinte a ce qu'un gerant peut comprendre et corriger
  'color-contrast': 'contraste-insuffisant',
  'image-alt': 'images-sans-description',
  'link-name': 'liens-sans-intitule',
  'button-name': 'boutons-sans-intitule',
  label: 'champs-sans-etiquette',
  'html-has-lang': 'langue-non-declaree',
  'meta-viewport': 'zoom-bloque',

  // Referencement
  'is-crawlable': 'indexation-bloquee',
  'document-title': 'titre-absent',
  'meta-description': 'description-absente',
  'crawlable-anchors': 'liens-non-suivables',
  'http-status-code': 'code-http-anormal',

  // Bonnes pratiques
  //
  // is-on-https signale des sous-ressources chargees en clair sur une page
  // servie en HTTPS. Ce n'est pas l'absence de HTTPS, qui est detectee par le
  // controle reseau de la phase 1. Confondre les deux ferait ecrire a un
  // client correctement certifie que son site n'est pas securise.
  'is-on-https': 'ressources-non-securisees',
  'errors-in-console': 'erreurs-javascript',
  deprecations: 'technologies-depreciees',
  viewport: 'viewport-absent',
};

/** En dessous de ces seuils, le constat n'a pas de quoi justifier une ligne. */
const MIN_SAVINGS_MS = 100;
const MIN_SAVINGS_BYTES = 10 * 1024;

const numeric = (audit) =>
  audit && Number.isFinite(audit.numericValue) ? audit.numericValue : null;

export function extractScores(lhr) {
  const get = (key) => {
    const score = lhr.categories?.[key]?.score;
    return Number.isFinite(score) ? score : null;
  };
  return {
    performance: get('performance'),
    accessibilite: get('accessibility'),
    bonnes_pratiques: get('best-practices'),
    seo: get('seo'),
  };
}

/**
 * Core Web Vitals mesurables en laboratoire.
 *
 * L'INP ne figure pas ici et ne peut pas y figurer : c'est une metrique de
 * terrain, calculee a partir des interactions de vrais visiteurs. Lighthouse
 * fournit le TBT, qui en est l'approximation officielle en laboratoire. Le
 * rapport doit le dire plutot que faire passer l'un pour l'autre.
 */
export function extractMetrics(lhr) {
  const a = lhr.audits ?? {};
  return {
    lcp: numeric(a['largest-contentful-paint']),
    cls: numeric(a['cumulative-layout-shift']),
    tbt: numeric(a['total-blocking-time']),
    ttfb: numeric(a['server-response-time']),
    fcp: numeric(a['first-contentful-paint']),
    speed_index: numeric(a['speed-index']),
    interactif: numeric(a.interactive),
  };
}

export function extractResources(lhr) {
  const a = lhr.audits ?? {};
  const requests = a['network-requests']?.details?.items ?? [];

  const parType = {};
  for (const item of a['resource-summary']?.details?.items ?? []) {
    if (!item.resourceType || item.resourceType === 'total') continue;
    parType[item.resourceType] = {
      requetes: item.requestCount ?? 0,
      octets: item.transferSize ?? 0,
    };
  }

  return {
    poids_total: numeric(a['total-byte-weight']),
    requetes: requests.length || null,
    par_type: parType,
  };
}

/**
 * Constats issus des audits en echec. Les economies renvoyees par Lighthouse
 * sont reprises telles quelles : ce sont ses chiffres, pas les notres, et
 * c'est ce qui les rend defendables devant un client.
 */
export function extractFindings(lhr, { strategy }) {
  const findings = [];

  for (const [auditId, findingId] of Object.entries(AUDIT_MAP)) {
    const audit = lhr.audits?.[auditId];
    if (!audit) continue;

    // score null : audit non applicable a cette page (informatif seulement).
    if (audit.score == null || audit.score >= 0.9) continue;

    const savingsMs = audit.details?.overallSavingsMs ?? null;
    const savingsBytes = audit.details?.overallSavingsBytes ?? null;

    const negligible =
      (savingsMs != null || savingsBytes != null) &&
      (savingsMs ?? 0) < MIN_SAVINGS_MS &&
      (savingsBytes ?? 0) < MIN_SAVINGS_BYTES;
    if (negligible) continue;

    findings.push({
      id: findingId,
      source: 'lighthouse',
      strategy,
      score: audit.score,
      savingsMs: Number.isFinite(savingsMs) ? Math.round(savingsMs) : null,
      savingsBytes: Number.isFinite(savingsBytes) ? Math.round(savingsBytes) : null,
      evidence: {
        audit: auditId,
        elements: audit.details?.items?.length ?? null,
        valeur: audit.displayValue ?? null,
      },
    });
  }

  return findings;
}

export function readLighthouse(lhr, { strategy }) {
  return {
    strategy,
    scores: extractScores(lhr),
    metrics: extractMetrics(lhr),
    resources: extractResources(lhr),
    findings: extractFindings(lhr, { strategy }),
    lighthouseVersion: lhr.lighthouseVersion ?? null,
    finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? null,
    fetchedAt: lhr.fetchTime ?? null,
  };
}
