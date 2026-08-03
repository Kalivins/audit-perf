/**
 * Valeurs par defaut et normalisation des options CLI.
 *
 * Deux niveaux de concurrence distincts, et ce n'est pas un detail :
 * la phase 1 ne fait qu'une requete HTTP par site et supporte le parallelisme,
 * alors que Lighthouse mesure des temps et fausse ses propres resultats si
 * plusieurs instances se disputent le CPU. D'ou lhConcurrency bas par defaut.
 */

export const VERSION = '0.1.0';

/**
 * User-agent identifiable. A personnaliser avec vos coordonnees : un
 * responsable de site qui voit passer cet UA dans ses logs doit pouvoir
 * savoir qui le sollicite et comment vous joindre.
 */
export const DEFAULT_USER_AGENT =
  `audit-perf/${VERSION} (+https://github.com/kevillard/audit-perf)`;

/**
 * Jeton court utilise pour interroger le robots.txt. Un fichier robots.txt
 * declare des groupes par nom de produit ("User-agent: audit-perf"), pas par
 * chaine complete : passer l'UA entier ferait manquer les regles qui nous
 * visent explicitement.
 */
export const USER_AGENT_TOKEN = 'audit-perf';

export const DEFAULTS = {
  out: './out',
  concurrency: 8,
  lhConcurrency: 2,
  delay: 2000,
  timeout: 30000,
  retries: 1,
  strategies: ['mobile', 'desktop'],
  quick: false,
  force: false,
  maxAge: null,
  limit: null,
  ignoreRobots: false,
  userAgent: DEFAULT_USER_AGENT,
  crux: false,
  /** Point-virgule par defaut : Excel en locale francaise n'accepte que lui. */
  csvDelimiter: ';',
};

/** Au dela de ce seuil les mesures Lighthouse deviennent peu fiables. */
export const LH_CONCURRENCY_WARN = 3;

/** Seuils Core Web Vitals publies par Google (bon / a ameliorer / mauvais). */
export const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  tbt: { good: 200, poor: 600 },
  ttfb: { good: 800, poor: 1800 },
  /** Metrique de terrain : renseignee seulement quand CrUX repond. */
  inp: { good: 200, poor: 500 },
};

function toInt(value, fallback, { min = 0, max = Infinity } = {}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Fusionne les options brutes de commander avec les defauts et valide les
 * bornes. Retourne toujours un objet complet et sain.
 */
export function buildConfig(raw = {}) {
  const strategies = parseStrategies(raw.strategies);

  return {
    ...DEFAULTS,
    out: raw.out || DEFAULTS.out,
    concurrency: toInt(raw.concurrency, DEFAULTS.concurrency, { min: 1, max: 32 }),
    lhConcurrency: toInt(raw.lhConcurrency, DEFAULTS.lhConcurrency, { min: 1, max: 8 }),
    delay: toInt(raw.delay, DEFAULTS.delay, { min: 0, max: 60000 }),
    timeout: toInt(raw.timeout, DEFAULTS.timeout, { min: 5000, max: 180000 }),
    retries: toInt(raw.retries, DEFAULTS.retries, { min: 0, max: 3 }),
    strategies,
    quick: Boolean(raw.quick),
    force: Boolean(raw.force),
    maxAge: raw.maxAge == null ? null : toInt(raw.maxAge, 0, { min: 0 }),
    limit: raw.limit == null ? null : toInt(raw.limit, 0, { min: 1 }),
    ignoreRobots: Boolean(raw.ignoreRobots),
    userAgent: raw.userAgent || DEFAULTS.userAgent,
    crux: Boolean(raw.crux),
    cruxKey: raw.cruxKey || process.env.CRUX_API_KEY || null,
    csvDelimiter: raw.csvDelimiter || DEFAULTS.csvDelimiter,
  };
}

function parseStrategies(value) {
  if (!value) return DEFAULTS.strategies;
  const list = String(value)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === 'mobile' || s === 'desktop');
  return list.length ? [...new Set(list)] : DEFAULTS.strategies;
}
