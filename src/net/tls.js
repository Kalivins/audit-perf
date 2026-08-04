/**
 * Inspection du certificat TLS.
 *
 * Un certificat qui expire dans dix jours est le constat le plus utile qu'un
 * audit puisse produire : la panne est datee, certaine, et visible par tous
 * les visiteurs le jour venu. Aucun gerant ne surveille cette date.
 *
 * La connexion se fait sans verification (rejectUnauthorized a false) parce
 * qu'il faut pouvoir examiner un certificat invalide pour le signaler. La
 * validite est ensuite lue sur la socket, pas supposee.
 */

import tls from 'node:tls';
import { frenchDate } from '../util/format.js';

/** En dessous, le renouvellement devient urgent. Let's Encrypt renouvelle a 30. */
export const SEUIL_URGENT_JOURS = 21;
export const SEUIL_ATTENTION_JOURS = 45;

const PROTOCOLES_OBSOLETES = new Set(['TLSv1', 'TLSv1.1', 'SSLv3']);

function joursAvant(dateTexte) {
  const date = new Date(dateTexte);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((date.getTime() - Date.now()) / 86400000);
}

function nomEmetteur(certificat) {
  const emetteur = certificat?.issuer;
  if (!emetteur) return null;
  return emetteur.O || emetteur.CN || emetteur.OU || null;
}

/**
 * @param {string} hostname
 * @returns {Promise<{disponible: boolean, raison?: string, ...}>}
 */
export function inspectCertificate(hostname, { port = 443, timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    let termine = false;
    const finir = (valeur) => {
      if (termine) return;
      termine = true;
      resolve(valeur);
    };

    let socket;
    try {
      socket = tls.connect(
        { host: hostname, port, servername: hostname, rejectUnauthorized: false },
        () => {
          const certificat = socket.getPeerCertificate(false);
          const protocole = socket.getProtocol();
          const autorise = socket.authorized;
          const erreurValidation = socket.authorizationError;
          socket.end();

          if (!certificat || !certificat.valid_to) {
            finir({ disponible: false, raison: 'aucun certificat presente' });
            return;
          }

          finir({
            disponible: true,
            valide: autorise,
            erreur_validation: autorise ? null : String(erreurValidation ?? 'inconnue'),
            emetteur: nomEmetteur(certificat),
            sujet: certificat.subject?.CN ?? null,
            valide_du: certificat.valid_from ?? null,
            valide_au: certificat.valid_to,
            jours_restants: joursAvant(certificat.valid_to),
            protocole,
            protocole_obsolete: PROTOCOLES_OBSOLETES.has(protocole),
          });
        }
      );
    } catch (error) {
      finir({ disponible: false, raison: error?.message ?? String(error) });
      return;
    }

    socket.setTimeout(timeout, () => {
      finir({ disponible: false, raison: 'delai depasse' });
      socket.destroy();
    });

    socket.on('error', (error) => {
      finir({ disponible: false, raison: error?.message ?? String(error) });
      socket.destroy();
    });
  });
}

/** Constats tires de l'inspection. */
export function checkCertificate(certificat) {
  const findings = [];
  if (!certificat?.disponible) return findings;

  // Les dates de certificat arrivent au format OpenSSL, en anglais. Elles
  // partent dans un rapport client francais : on les traduit ici plutot que
  // de laisser passer un "Aug 16 02:16:46 2026 GMT" au milieu du texte.
  const expireLe = frenchDate(certificat.valide_au);

  if (certificat.valide === false) {
    findings.push({
      id: 'certificat-invalide',
      source: 'reseau',
      evidence: {
        motif: certificat.erreur_validation,
        emetteur: certificat.emetteur,
      },
    });
  } else if (Number.isFinite(certificat.jours_restants)) {
    if (certificat.jours_restants <= 0) {
      findings.push({
        id: 'certificat-expire',
        source: 'reseau',
        evidence: { expire_le: expireLe },
      });
    } else if (certificat.jours_restants <= SEUIL_URGENT_JOURS) {
      findings.push({
        id: 'certificat-expire-bientot',
        source: 'reseau',
        evidence: {
          jours: certificat.jours_restants,
          expire_le: expireLe,
          emetteur: certificat.emetteur,
        },
      });
    }
  }

  if (certificat.protocole_obsolete) {
    findings.push({
      id: 'tls-obsolete',
      source: 'reseau',
      evidence: { protocole: certificat.protocole },
    });
  }

  return findings;
}
