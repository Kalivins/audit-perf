/**
 * Persistance des resultats et reprise apres interruption.
 *
 * Un lot de trois cents sites dure des heures. Il sera interrompu : coupure
 * reseau, mise en veille, Ctrl+C. Chaque site termine est donc ecrit
 * immediatement sur disque, et une relance repart de la ou elle s'est arretee.
 *
 * Les ecritures passent par un fichier temporaire puis un renommage. Sans
 * cela, une interruption au milieu d'une ecriture laisserait un JSON tronque
 * qui ferait echouer toutes les relances suivantes, exactement au moment ou
 * la reprise doit sauver la mise.
 */

import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const FORMAT_VERSION = 1;

export function createStore(outDir) {
  const dirs = {
    root: outDir,
    raw: path.join(outDir, 'brut'),
    reports: path.join(outDir, 'rapports'),
  };

  async function init() {
    await mkdir(dirs.raw, { recursive: true });
    await mkdir(dirs.reports, { recursive: true });
  }

  const fileFor = (id) => path.join(dirs.raw, `${id}.json`);

  async function writeJson(file, data) {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, file);
  }

  async function read(id) {
    try {
      const raw = await readFile(fileFor(id), 'utf8');
      const parsed = JSON.parse(raw);
      // Un enregistrement produit par une version anterieure du format est
      // ignore plutot que reinterprete de travers.
      return parsed?.formatVersion === FORMAT_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }

  return {
    dirs,
    init,

    /**
     * Resultat deja en cache et encore valable ?
     * @param {string} id
     * @param {{force?: boolean, maxAge?: number|null}} options maxAge en jours
     */
    async cached(id, { force = false, maxAge = null } = {}) {
      if (force) return null;
      const record = await read(id);
      if (!record) return null;

      if (maxAge != null) {
        const age = Date.now() - new Date(record.checkedAt).getTime();
        if (!Number.isFinite(age) || age > maxAge * 24 * 3600 * 1000) return null;
      }
      return record;
    },

    async save(record) {
      await writeJson(fileFor(record.target.id), {
        formatVersion: FORMAT_VERSION,
        ...record,
      });
    },

    /** Tous les resultats en cache, pour regenerer les sorties sans rescanner. */
    async all() {
      let files;
      try {
        files = await readdir(dirs.raw);
      } catch {
        return [];
      }

      const records = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const record = await read(path.basename(file, '.json'));
        if (record) records.push(record);
      }
      return records;
    },

    /** Nettoyage des temporaires laisses par une interruption. */
    async sweep() {
      try {
        const files = await readdir(dirs.raw);
        await Promise.all(
          files
            .filter((f) => f.endsWith('.tmp'))
            .map((f) => rm(path.join(dirs.raw, f), { force: true }))
        );
      } catch {
        // Repertoire absent : rien a nettoyer.
      }
    },
  };
}
