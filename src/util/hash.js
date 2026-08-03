import { createHash } from 'node:crypto';

/** Empreinte courte et stable, utilisee pour nommer les fichiers de cache. */
export function shortHash(input, length = 10) {
  return createHash('sha1').update(String(input)).digest('hex').slice(0, length);
}

/** "Boulangerie Cédric & Fils" -> "boulangerie-cedric-fils" */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Nom de fichier du rapport : lisible pour vous, mais suffixe d'une empreinte
 * pour que deux entreprises homonymes ne s'ecrasent pas l'une l'autre.
 */
export function targetSlug(name, url) {
  const base = slugify(name) || 'site';
  return `${base}-${shortHash(url, 6)}`;
}
