/**
 * Commande `serve` : sert le dossier de sortie en local pour consulter les
 * rapports dans un navigateur.
 *
 * Ouvrir les fichiers en file:// fonctionne mal, et les rapports contiennent
 * des donnees d'entreprises reelles. Le serveur n'ecoute donc que sur
 * 127.0.0.1 : rien n'est expose au reseau local, meme par inadvertance.
 *
 * Zero dependance : le module http de Node suffit largement pour du statique.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildConfig } from '../config.js';
import { log, c } from '../util/log.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const PORT_DEFAUT = 4173;
const HOTE = '127.0.0.1';

function typeDe(fichier) {
  return TYPES[path.extname(fichier).toLowerCase()] ?? 'application/octet-stream';
}

/** Resout une URL en chemin, en refusant tout ce qui sort de la racine. */
function resoudre(racine, urlPath) {
  let decode;
  try {
    decode = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  const cible = path.resolve(racine, '.' + decode);
  const relatif = path.relative(racine, cible);
  // Une remontee hors du dossier servi produit un chemin relatif commencant
  // par .. ou un chemin absolu. Dans les deux cas on refuse.
  if (relatif.startsWith('..') || path.isAbsolute(relatif)) return null;
  return cible;
}

export async function runServe(options = {}) {
  const config = buildConfig(options);
  const racine = path.resolve(config.out);
  const port = Number.parseInt(options.port, 10) || PORT_DEFAUT;

  try {
    await stat(path.join(racine, 'index.html'));
  } catch {
    log.error(
      `Aucun index dans ${racine}.\n` +
        '  Lancez "audit scan <fichier>" puis reessayez, ou "audit report" si\n' +
        '  des mesures sont deja en cache.'
    );
    process.exitCode = 1;
    return;
  }

  const serveur = createServer(async (requete, reponse) => {
    let cible = resoudre(racine, requete.url ?? '/');
    if (!cible) {
      reponse.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      reponse.end('Acces refuse');
      return;
    }

    try {
      let infos = await stat(cible);
      if (infos.isDirectory()) {
        cible = path.join(cible, 'index.html');
        infos = await stat(cible);
      }
      const contenu = await readFile(cible);
      reponse.writeHead(200, {
        'content-type': typeDe(cible),
        'content-length': infos.size,
        // Les rapports sont regeneres souvent : on ne veut pas d'une version
        // gardee en cache par le navigateur pendant qu'on itere dessus.
        'cache-control': 'no-store',
      });
      reponse.end(contenu);
    } catch {
      reponse.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      reponse.end('<p>Page introuvable. <a href="/">Retour au sommaire</a></p>');
    }
  });

  serveur.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      log.error(`Le port ${port} est deja pris. Relancez avec --port <autre>.`);
      process.exitCode = 1;
      return;
    }
    log.error(error?.message ?? String(error));
    process.exitCode = 1;
  });

  serveur.listen(port, HOTE, () => {
    log.blank();
    log.ok(`Rapports consultables sur ${c.bold(`http://${HOTE}:${port}/`)}`);
    log.info(c.grey(`  Dossier servi : ${racine}`));
    log.info(c.grey('  Ecoute limitee a cette machine. Ctrl+C pour arreter.'));
    log.blank();
  });
}
