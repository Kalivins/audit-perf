/**
 * Enregistrements DNS liés à la messagerie.
 *
 * Sans SPF ni DMARC, n'importe qui peut envoyer un courrier en se faisant
 * passer pour l'entreprise. Pour un artisan qui envoie des devis par mail,
 * c'est un risque concret d'usurpation, et personne ne le lui a jamais dit.
 *
 * C'est aussi le constat le plus verifiable de tout l'audit : le client peut
 * le faire confirmer par son prestataire en trente secondes.
 */

import { promises as dns } from 'node:dns';

/**
 * Domaine à interroger. On retire le www, sans chercher a gerer finement les
 * suffixes publics : les cibles sont des domaines francais ordinaires, et une
 * bibliotheque de suffixes serait disproportionnee ici.
 */
export function domaineDe(hostname) {
  return String(hostname ?? '').replace(/^www\./i, '').toLowerCase();
}

async function txt(nom) {
  try {
    const enregistrements = await dns.resolveTxt(nom);
    return enregistrements.map((morceaux) => morceaux.join(''));
  } catch {
    return [];
  }
}

function politiqueDmarc(enregistrement) {
  const correspondance = /\bp\s*=\s*(none|quarantine|reject)\b/i.exec(enregistrement);
  return correspondance ? correspondance[1].toLowerCase() : null;
}

export async function inspectDns(hostname, { timeout = 8000 } = {}) {
  const domaine = domaineDe(hostname);

  const abandon = new Promise((resolve) =>
    setTimeout(() => resolve('timeout'), timeout)
  );

  const travail = (async () => {
    const [spfBrut, dmarcBrut, mx] = await Promise.all([
      txt(domaine),
      txt(`_dmarc.${domaine}`),
      dns.resolveMx(domaine).catch(() => []),
    ]);

    const spf = spfBrut.find((r) => /^v=spf1\b/i.test(r.trim())) ?? null;
    const dmarc = dmarcBrut.find((r) => /^v=DMARC1\b/i.test(r.trim())) ?? null;

    return {
      disponible: true,
      domaine,
      spf,
      dmarc,
      politique_dmarc: dmarc ? politiqueDmarc(dmarc) : null,
      mx: mx.map((m) => m.exchange),
      recoit_du_courrier: mx.length > 0,
    };
  })();

  const resultat = await Promise.race([travail, abandon]);
  if (resultat === 'timeout') {
    return { disponible: false, domaine, raison: 'delai depasse' };
  }
  return resultat;
}

export function checkDns(dnsInfo) {
  const findings = [];
  if (!dnsInfo?.disponible) return findings;

  if (!dnsInfo.spf) {
    findings.push({
      id: 'spf-absent',
      source: 'reseau',
      evidence: { domaine: dnsInfo.domaine },
    });
  }

  if (!dnsInfo.dmarc) {
    findings.push({
      id: 'dmarc-absent',
      source: 'reseau',
      evidence: { domaine: dnsInfo.domaine },
    });
  } else if (dnsInfo.politique_dmarc === 'none') {
    // Un DMARC en p=none observe sans rien bloquer. C'est une etape de mise en
    // place, pas une protection : le distinguer de l'absence evite de dire au
    // client qu'il n'a rien fait alors qu'il a commence.
    findings.push({
      id: 'dmarc-sans-protection',
      source: 'reseau',
      evidence: { domaine: dnsInfo.domaine, politique: dnsInfo.politique_dmarc },
    });
  }

  return findings;
}
