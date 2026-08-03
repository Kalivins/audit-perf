/**
 * Etat du chiffrement. Deux constats distincts, souvent confondus :
 * l'absence pure de HTTPS, et un HTTPS present mais non impose.
 */

export function checkHttps({ page, redirect }) {
  const findings = [];

  if (page.httpsAvailable === false) {
    findings.push({
      id: 'https-absent',
      evidence: {
        servi_en: 'http',
        url_testee: page.url,
      },
    });
    // Inutile d'ajouter "https non force" par-dessus : il n'y a rien a forcer.
    return findings;
  }

  if (redirect?.checked && redirect.redirectsToHttps === false) {
    findings.push({
      id: 'https-non-force',
      evidence: {
        reponse_en_http: redirect.status,
      },
    });
  }

  return findings;
}
