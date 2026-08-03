/**
 * Enveloppe HTML et petits composants du rapport.
 * Aucune ressource externe : le fichier produit se suffit a lui-meme.
 */

import { STYLES } from './styles.js';
import { escapeHtml } from '../util/format.js';

export function page({ titre, corps }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(titre)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="page">
${corps}
</main>
</body>
</html>
`;
}

const SEUILS = { mauvais: 50, moyen: 90 };
const COULEURS = { mauvais: '#c0342b', moyen: '#b5620a', bon: '#1f7a45', absent: '#9aa3b2' };

export function couleurScore(value) {
  if (!Number.isFinite(value)) return COULEURS.absent;
  if (value < SEUILS.mauvais) return COULEURS.mauvais;
  if (value < SEUILS.moyen) return COULEURS.moyen;
  return COULEURS.bon;
}

export function classeSeuil(value, { bon, moyen }) {
  if (!Number.isFinite(value)) return '';
  if (value <= bon) return 'vert';
  if (value <= moyen) return 'orange';
  return 'rouge';
}

/**
 * Jauge circulaire en SVG pur. Pas de script, pas d'image : elle survit a
 * l'impression et a une messagerie qui bloque tout.
 */
export function jauge(value, nom) {
  const rayon = 30;
  const circonference = 2 * Math.PI * rayon;
  const part = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;
  const reste = circonference * (1 - part);
  const couleur = couleurScore(value);
  const texte = Number.isFinite(value) ? String(value) : '?';

  return `<div class="jauge">
  <svg width="76" height="76" viewBox="0 0 76 76" role="img"
       aria-label="${escapeHtml(nom)} : ${escapeHtml(texte)} sur 100">
    <circle cx="38" cy="38" r="${rayon}" fill="none" stroke="#e2e6ee" stroke-width="7"/>
    <circle cx="38" cy="38" r="${rayon}" fill="none" stroke="${couleur}" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="${circonference.toFixed(1)}"
            stroke-dashoffset="${reste.toFixed(1)}"
            transform="rotate(-90 38 38)"/>
    <text x="38" y="38" text-anchor="middle" dominant-baseline="central"
          font-size="21" font-weight="700" fill="${couleur}"
          font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    >${escapeHtml(texte)}</text>
  </svg>
  <div class="nom">${escapeHtml(nom)}</div>
</div>`;
}

export function etiquette(texte, classe) {
  return `<span class="etiquette ${classe}">${escapeHtml(texte)}</span>`;
}

export function section(titre, contenu) {
  if (!contenu) return '';
  return `<h2>${escapeHtml(titre)}</h2>\n${contenu}`;
}

/** Paragraphe echappe, ignore si le texte est vide. */
export function para(texte, classe = '') {
  if (!texte) return '';
  const attr = classe ? ` class="${classe}"` : '';
  return `<p${attr}>${escapeHtml(texte)}</p>`;
}
