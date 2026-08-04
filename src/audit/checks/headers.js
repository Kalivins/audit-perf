/**
 * En-tetes de securite de la reponse HTTP.
 *
 * Un seul constat regroupant les en-tetes manquants, plutot qu'un par en-tete.
 * Quatre lignes techniques d'affilee dans un rapport client noient les
 * problemes qui comptent vraiment, et se corrigent de toute facon d'un seul
 * geste dans la configuration du serveur.
 */

const ATTENDUS = [
  {
    cle: 'strict-transport-security',
    nom: 'HSTS',
    role: 'impose le chiffrement pour toutes les visites suivantes',
  },
  {
    cle: 'x-content-type-options',
    nom: 'X-Content-Type-Options',
    role: 'empeche le navigateur de deviner le type d\'un fichier',
  },
  {
    cle: 'referrer-policy',
    nom: 'Referrer-Policy',
    role: 'limite ce que vos visiteurs revelent aux sites tiers',
  },
];

/** Le blocage d'affichage en cadre peut venir de deux en-tetes differents. */
function protegeContreLeCadrage(headers) {
  if (headers['x-frame-options']) return true;
  return /frame-ancestors/i.test(headers['content-security-policy'] ?? '');
}

export function checkHeaders({ headers = {}, httpsAvailable = true }) {
  const findings = [];
  const bas = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  const manquants = [];

  for (const attendu of ATTENDUS) {
    // HSTS n'a aucun sens sur un site qui ne repond pas en HTTPS : le signaler
    // la ferait doublon avec un constat autrement plus grave.
    if (attendu.cle === 'strict-transport-security' && !httpsAvailable) continue;
    if (!bas[attendu.cle]) manquants.push(attendu.nom);
  }

  if (!protegeContreLeCadrage(bas)) manquants.push('X-Frame-Options');

  if (manquants.length) {
    findings.push({
      id: 'entetes-securite-absents',
      source: 'html',
      evidence: { manquants, nombre: manquants.length },
    });
  }

  // Le serveur qui annonce sa version exacte facilite le travail de qui
  // cherche une faille connue. Constat mineur, mais gratuit a corriger.
  const bavards = ['x-powered-by', 'server']
    .filter((cle) => /\d+\.\d+/.test(String(bas[cle] ?? '')))
    .map((cle) => `${cle}: ${bas[cle]}`);

  if (bavards.length) {
    findings.push({
      id: 'version-serveur-exposee',
      source: 'html',
      evidence: { entetes: bavards },
    });
  }

  return {
    findings,
    summary: {
      manquants,
      presents: ATTENDUS.filter((a) => bas[a.cle]).map((a) => a.nom),
    },
  };
}
