/**
 * Chargement des textes clients.
 *
 * Ils vivent dans data/copy/*.json, hors du code, pour etre reecrits dans
 * votre propre voix sans rien casser. C'est la partie du rapport qui a de la
 * valeur : le chiffre Lighthouse ne vaut que par l'explication qui
 * l'accompagne.
 */

import { readFile } from 'node:fs/promises';

const THEMES = ['conformite', 'performance', 'contenu'];

let cache = null;

export async function loadCopy() {
  if (cache) return cache;

  const merged = {};
  for (const theme of THEMES) {
    const url = new URL(`../../data/copy/${theme}.fr.json`, import.meta.url);
    const parsed = JSON.parse(await readFile(url, 'utf8'));
    for (const [id, entry] of Object.entries(parsed)) {
      merged[id] = { ...entry, theme };
    }
  }

  cache = merged;
  return merged;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Remplace les marqueurs {cle} par leur valeur.
 *
 * Un marqueur non resolu ne doit jamais atteindre le client : il est retire,
 * et signale dans `missing` pour que l'appelant decide quoi faire de la
 * phrase devenue incomplete.
 *
 * @returns {{text: string, missing: string[]}}
 */
export function render(template, context = {}) {
  const missing = [];

  const text = String(template ?? '')
    .replace(PLACEHOLDER, (match, key) => {
      const value = context[key];
      if (value == null || value === '') {
        missing.push(key);
        return '';
      }
      return String(value);
    })
    // Uniquement les espaces surnumeraires. Surtout pas de recollage de la
    // ponctuation : le francais veut une espace avant les deux-points et le
    // point-virgule, et « le fichier .htaccess » deviendrait « fichier.htaccess ».
    .replace(/ {2,}/g, ' ')
    .trim();

  return { text, missing };
}

/** Liste des marqueurs utilises par une entree, pour les controles. */
export function placeholdersOf(entry) {
  const found = new Set();
  for (const field of ['constat', 'cout', 'correction', 'titre']) {
    for (const match of String(entry?.[field] ?? '').matchAll(PLACEHOLDER)) {
      found.add(match[1]);
    }
  }
  return [...found];
}
