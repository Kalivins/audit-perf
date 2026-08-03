/**
 * Donnees de terrain, via l'API Chrome UX Report de Google.
 *
 * Seule source capable de fournir un INP reel : cette metrique se calcule sur
 * les interactions de vrais visiteurs et ne peut pas etre mesuree en
 * laboratoire. Lighthouse en fournit une approximation, le TBT, que le rapport
 * presente comme telle.
 *
 * Deux raisons pour lesquelles ce module reste optionnel et desactive par
 * defaut :
 *
 * 1. Il demande une cle d'API Google. L'outil se veut utilisable sans compte
 *    ni service tiers, et cette dependance ne doit jamais etre imposee.
 * 2. L'API ne repond que pour les sites disposant d'assez de trafic. Sur une
 *    TPE locale, elle retournera presque toujours qu'elle n'a pas de donnees.
 *    C'est attendu, ce n'est pas une erreur, et le rapport n'en parle pas.
 *
 * Toute defaillance est silencieuse par construction : l'absence de donnees de
 * terrain ne doit jamais empecher la production d'un audit.
 */

const ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

const FORM_FACTORS = { mobile: 'PHONE', desktop: 'DESKTOP' };

/** Correspondance metrique CrUX -> nom employe dans le reste de l'outil. */
const METRIQUES = {
  largest_contentful_paint: 'lcp',
  interaction_to_next_paint: 'inp',
  cumulative_layout_shift: 'cls',
  experimental_time_to_first_byte: 'ttfb',
};

function lirePercentiles(metrics) {
  const lu = {};
  for (const [cle, nom] of Object.entries(METRIQUES)) {
    const p75 = metrics?.[cle]?.percentiles?.p75;
    if (p75 == null) continue;
    const valeur = typeof p75 === 'string' ? Number.parseFloat(p75) : p75;
    if (Number.isFinite(valeur)) lu[nom] = valeur;
  }
  return lu;
}

/**
 * @param {string} url
 * @param {{key: string, strategy?: string, timeout?: number}} options
 * @returns {Promise<{disponible: boolean, raison?: string, metriques?: object}>}
 */
export async function fetchFieldData(url, options = {}) {
  const { key, strategy = 'mobile', timeout = 15000 } = options;
  if (!key) return { disponible: false, raison: 'aucune cle d\'API fournie' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    // L'origine plutot que l'URL exacte : une page d'accueil de TPE n'a
    // presque jamais assez de trafic a elle seule pour figurer dans CrUX.
    const origine = new URL(url).origin;

    const reponse = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: origine,
        formFactor: FORM_FACTORS[strategy] ?? FORM_FACTORS.mobile,
      }),
      signal: controller.signal,
    });

    if (reponse.status === 404) {
      return { disponible: false, raison: 'trafic insuffisant pour figurer dans CrUX' };
    }
    if (!reponse.ok) {
      return { disponible: false, raison: `reponse ${reponse.status} de l'API CrUX` };
    }

    const donnees = await reponse.json();
    const metriques = lirePercentiles(donnees?.record?.metrics);

    if (!Object.keys(metriques).length) {
      return { disponible: false, raison: 'aucune metrique exploitable' };
    }

    return {
      disponible: true,
      origine,
      profil: strategy,
      periode: donnees?.record?.collectionPeriod ?? null,
      metriques,
    };
  } catch (error) {
    return {
      disponible: false,
      raison:
        error?.name === 'AbortError'
          ? 'delai depasse'
          : `appel impossible : ${error?.message ?? error}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
