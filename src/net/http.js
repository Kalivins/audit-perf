/**
 * Requetes HTTP. S'appuie sur le fetch natif de Node (>= 18), sans dependance.
 *
 * Toute erreur est traduite en code stable et lisible : un site injoignable
 * doit produire une ligne exploitable dans le rapport, jamais une exception
 * qui interrompt le lot.
 */

const ACCEPT_HTML =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

/** Codes d'erreur exposes au reste de l'outil. */
export const ERRORS = {
  TIMEOUT: 'timeout',
  DNS: 'dns_introuvable',
  TLS: 'certificat_invalide',
  REFUSED: 'connexion_refusee',
  NETWORK: 'erreur_reseau',
};

/** Libelles francais, utilises tels quels dans les sorties. */
export const ERROR_LABELS = {
  [ERRORS.TIMEOUT]: 'delai depasse',
  [ERRORS.DNS]: 'domaine introuvable',
  [ERRORS.TLS]: 'certificat invalide',
  [ERRORS.REFUSED]: 'connexion refusee',
  [ERRORS.NETWORK]: 'erreur reseau',
};

function classifyError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return ERRORS.TIMEOUT;
  }
  const code = error?.cause?.code || error?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return ERRORS.DNS;
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return ERRORS.REFUSED;
  if (
    typeof code === 'string' &&
    (code.startsWith('CERT_') ||
      code.startsWith('DEPTH_ZERO') ||
      code.startsWith('SELF_SIGNED') ||
      code.startsWith('UNABLE_TO_VERIFY') ||
      code.startsWith('ERR_TLS'))
  ) {
    return ERRORS.TLS;
  }
  return ERRORS.NETWORK;
}

/**
 * Une requete, sans reessai. Ne rejette jamais : retourne toujours un objet
 * decrivant soit la reponse, soit l'echec.
 */
export async function request(url, options = {}) {
  const {
    method = 'GET',
    userAgent,
    timeout = 30000,
    redirect = 'follow',
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method,
      redirect,
      signal: controller.signal,
      headers: {
        'user-agent': userAgent,
        accept: ACCEPT_HTML,
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });

    // Temps jusqu'aux en-tetes : approximation du TTFB, suffisante en mode
    // rapide. Lighthouse fournit la vraie mesure quand il tourne.
    const headersAt = performance.now() - startedAt;
    const body = method === 'HEAD' ? '' : await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      redirected: response.redirected,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      approxTtfb: Math.round(headersAt),
      totalMs: Math.round(performance.now() - startedAt),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      redirected: false,
      headers: {},
      body: '',
      approxTtfb: null,
      totalMs: Math.round(performance.now() - startedAt),
      error: classifyError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Reessaie une fois sur erreur reseau transitoire, jamais sur un 4xx. */
export async function requestWithRetry(url, options = {}) {
  const { retries = 1, ...rest } = options;
  let last = await request(url, rest);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const transient =
      last.error === ERRORS.TIMEOUT ||
      last.error === ERRORS.NETWORK ||
      last.error === ERRORS.REFUSED;
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    last = await request(url, rest);
  }

  return last;
}

/**
 * Recupere la page d'accueil en determinant au passage l'etat reel du HTTPS.
 *
 * Le point delicat : une URL saisie sans schema a ete prefixee en https par la
 * normalisation. Si ce https echoue, il faut retomber en http avant de
 * conclure. Un site qui ne repond qu'en http est un site non conforme, pas un
 * site injoignable, et la difference change tout dans le rapport.
 */
export async function fetchHomepage(url, options = {}) {
  const target = new URL(url);
  const wasHttps = target.protocol === 'https:';

  let response = await requestWithRetry(url, options);
  let httpsAvailable = wasHttps && response.ok;
  let fellBackToHttp = false;

  if (!response.ok && wasHttps && response.error) {
    const httpUrl = new URL(url);
    httpUrl.protocol = 'http:';
    const fallback = await requestWithRetry(httpUrl.toString(), options);
    if (fallback.ok) {
      response = fallback;
      httpsAvailable = false;
      fellBackToHttp = true;
    }
  }

  return { ...response, httpsAvailable, fellBackToHttp };
}

/**
 * Le site force-t-il le HTTPS ? Une seule requete HEAD sur l'origine en clair,
 * sans suivre la redirection pour pouvoir lire le code et la destination.
 */
export async function checkHttpRedirect(url, options = {}) {
  const httpUrl = new URL(url);
  httpUrl.protocol = 'http:';

  const response = await request(httpUrl.toString(), {
    ...options,
    method: 'HEAD',
    redirect: 'manual',
  });

  if (response.error) return { checked: false, redirectsToHttps: null };

  const location = response.headers.location || '';
  const isRedirect = response.status >= 300 && response.status < 400;
  return {
    checked: true,
    status: response.status,
    redirectsToHttps: isRedirect && /^https:/i.test(location),
  };
}

/** Sonde legere pour verifier qu'une page existe (mentions legales, etc.). */
export async function probe(url, options = {}) {
  const head = await request(url, { ...options, method: 'HEAD' });
  // Beaucoup de serveurs mutualises repondent 405 ou 403 a un HEAD tout en
  // servant la page en GET. On retente pour ne pas declarer absente une page
  // qui existe.
  if (head.status === 405 || head.status === 403 || head.status === 501) {
    return request(url, { ...options, method: 'GET' });
  }
  return head;
}
