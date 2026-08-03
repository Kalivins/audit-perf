/**
 * Espacement des requetes par domaine.
 *
 * La limite de concurrence globale ne suffit pas : huit sites en parallele,
 * c'est acceptable, mais huit requetes simultanees sur le meme serveur
 * mutualise ne l'est pas. Ce planificateur serialise ce qui vise un meme hote
 * et garantit un delai minimal entre deux requetes vers ce meme hote.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createScheduler({ delay = 2000 } = {}) {
  /** hote -> promesse de fin de la derniere tache planifiee */
  const chains = new Map();
  /** hote -> horodatage de la derniere requete effectivement partie */
  const lastRequestAt = new Map();
  /** hote -> delai specifique impose par le robots.txt du site */
  const hostDelays = new Map();

  function effectiveDelay(host) {
    return Math.max(delay, hostDelays.get(host) ?? 0);
  }

  return {
    /**
     * Le site demande un Crawl-delay plus long que le notre : on obeit.
     * @param {number} seconds
     */
    setHostDelay(host, seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      // Garde-fou : un robots.txt annoncant 3600 s bloquerait le lot entier.
      const capped = Math.min(seconds, 30);
      hostDelays.set(host, capped * 1000);
    },

    /** Delai reellement applique a cet hote, en ms. Expose pour le journal. */
    delayFor(host) {
      return effectiveDelay(host);
    },

    /**
     * Execute `fn` en respectant l'ordre et l'espacement propres a cet hote.
     * La valeur de retour de `fn` est transmise telle quelle.
     */
    run(host, fn) {
      const previous = chains.get(host) ?? Promise.resolve();

      const task = previous.then(async () => {
        const since = Date.now() - (lastRequestAt.get(host) ?? 0);
        const wait = effectiveDelay(host) - since;
        if (wait > 0) await sleep(wait);
        try {
          return await fn();
        } finally {
          lastRequestAt.set(host, Date.now());
        }
      });

      // La chaine ne doit jamais porter de rejet, sinon l'echec d'une requete
      // ferait echouer toutes les suivantes sur le meme hote.
      chains.set(
        host,
        task.then(
          () => undefined,
          () => undefined
        )
      );

      return task;
    },
  };
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
}
