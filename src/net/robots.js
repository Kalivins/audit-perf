/**
 * Lecture et application du robots.txt.
 *
 * Politique retenue, alignee sur la RFC 9309 :
 *   - 2xx           : on applique les regles telles quelles
 *   - 404 / 410     : pas de regles, tout est autorise
 *   - 5xx / reseau  : le fichier est indisponible, on s'abstient
 *   - Crawl-delay   : respecte, et il prime sur notre delai par defaut
 *
 * Le cas 5xx est volontairement strict. Il vaut mieux sauter un prospect que
 * solliciter un serveur qui donne deja des signes de faiblesse.
 */

import robotsParser from 'robots-parser';
import { request } from './http.js';
import { hostOf } from './politeness.js';

export const ROBOTS_STATUS = {
  ALLOWED: 'allowed',
  DISALLOWED: 'disallowed',
  UNAVAILABLE: 'unavailable',
};

export function createRobotsCache({
  userAgent,
  userAgentToken,
  timeout = 15000,
  ignore = false,
  scheduler = null,
} = {}) {
  /** origine -> promesse d'un objet { robots, reachable } */
  const cache = new Map();

  async function fetchRobots(origin) {
    const url = `${origin}/robots.txt`;
    const doFetch = () => request(url, { userAgent, timeout });
    const response = scheduler
      ? await scheduler.run(hostOf(origin), doFetch)
      : await doFetch();

    if (response.error) {
      // On remonte le code reseau : un domaine mort doit etre rapporte comme
      // tel, pas comme un site qui nous refuserait l'acces.
      return { robots: null, reachable: false, status: 0, error: response.error };
    }
    if (response.status === 404 || response.status === 410) {
      return { robots: null, reachable: true, status: response.status };
    }
    if (response.status >= 500) {
      return { robots: null, reachable: false, status: response.status };
    }
    if (!response.ok) {
      // 401, 403 : le fichier existe peut-etre mais nous est refuse. On
      // considere qu'aucune regle ne nous vise.
      return { robots: null, reachable: true, status: response.status };
    }

    return {
      robots: robotsParser(url, response.body),
      reachable: true,
      status: response.status,
    };
  }

  function load(origin) {
    if (!cache.has(origin)) cache.set(origin, fetchRobots(origin));
    return cache.get(origin);
  }

  return {
    /** Sitemaps declares par le site lui-meme, s'il en annonce. */
    async sitemaps(url) {
      if (ignore) return [];
      try {
        const { robots } = await load(new URL(url).origin);
        return robots?.getSitemaps?.() ?? [];
      } catch {
        return [];
      }
    },

    /**
     * @returns {Promise<{status: string, allowed: boolean, crawlDelay: number|null, detail: string}>}
     */
    async check(url) {
      if (ignore) {
        return {
          status: ROBOTS_STATUS.ALLOWED,
          allowed: true,
          crawlDelay: null,
          detail: 'robots.txt ignore (--ignore-robots)',
        };
      }

      let origin;
      try {
        origin = new URL(url).origin;
      } catch {
        return {
          status: ROBOTS_STATUS.DISALLOWED,
          allowed: false,
          crawlDelay: null,
          networkError: null,
          detail: 'URL illisible',
        };
      }

      const { robots, reachable, status, error } = await load(origin);

      if (!reachable) {
        return {
          status: ROBOTS_STATUS.UNAVAILABLE,
          allowed: false,
          crawlDelay: null,
          // Renseigne uniquement quand l'echec est reseau : le lanceur s'en
          // sert pour classer la cible en domaine mort plutot qu'en exclusion.
          networkError: error ?? null,
          detail:
            status >= 500
              ? `robots.txt en erreur ${status}, abstention`
              : 'robots.txt injoignable, abstention',
        };
      }

      if (!robots) {
        return {
          status: ROBOTS_STATUS.ALLOWED,
          allowed: true,
          crawlDelay: null,
          detail: 'aucun robots.txt',
        };
      }

      const allowed = robots.isAllowed(url, userAgentToken);
      const crawlDelay = robots.getCrawlDelay(userAgentToken) ?? null;

      return {
        status: allowed === false ? ROBOTS_STATUS.DISALLOWED : ROBOTS_STATUS.ALLOWED,
        // isAllowed peut retourner undefined quand aucune regle ne s'applique :
        // dans ce cas la norme veut que ce soit autorise.
        allowed: allowed !== false,
        crawlDelay,
        detail:
          allowed === false
            ? 'exclu par le robots.txt du site'
            : 'autorise par le robots.txt',
      };
    },
  };
}
